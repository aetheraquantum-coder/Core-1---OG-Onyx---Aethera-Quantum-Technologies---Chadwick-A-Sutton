import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';

typedef Record = Map<String, dynamic>;
const maxDocumentBytes = 2 * 1024 * 1024;
const maxTextLength = 65536;
const modes = ['focused', 'calm', 'creative', 'direct'];
String digestText(String text) => sha256.convert(utf8.encode(text)).toString();
String newId() => List.generate(16, (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')).join();
String now() => DateTime.now().toUtc().toIso8601String();

String xPostId(String input) {
  final uri = Uri.tryParse(input.trim());
  if (uri == null || uri.scheme != 'https' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].contains(uri.host.toLowerCase()) || uri.userInfo.isNotEmpty || (uri.hasPort && uri.port != 443)) {
    throw const FormatException('Use an HTTPS x.com or twitter.com post link.');
  }
  final match = RegExp(r'^/(?:[A-Za-z0-9_]{1,15}/status|i/web/status)/([0-9]{1,20})(?:/(?:photo|video)/[1-4])?/?$').firstMatch(uri.path);
  if (match == null || BigInt.parse(match.group(1)!) <= BigInt.zero) {
    throw const FormatException('A numeric X post ID is required.');
  }
  return match.group(1)!;
}

Uri providerUri(String input) {
  final uri = Uri.tryParse(input.trim());
  if (uri == null || uri.host.isEmpty || uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment || RegExp(r'[\s\\]').hasMatch(input.trim())) {
    throw const FormatException('Provider URL must not contain credentials, query parameters or fragments.');
  }
  final loopback = ['localhost', '127.0.0.1', '::1'].contains(uri.host);
  if (uri.scheme != 'https' && !(uri.scheme == 'http' && loopback)) {
    throw const FormatException('Use HTTPS, or HTTP only for an on-device loopback server.');
  }
  return uri;
}

String contextFor(String projectId, List<Record> sources) {
  final selected = sources.where((s) => s['projectId'] == projectId).toList();
  var total = 0;
  final lines = <String>[];
  for (final source in selected) {
    final text = source['text']?.toString() ?? '';
    total += text.length;
    if (total > 48000) throw const FormatException('Selected context exceeds 48,000 characters. Select fewer sources.');
    lines.add(jsonEncode({'id': source['id'], 'title': source['title'], 'kind': source['kind'], 'url': source['url'] ?? '', 'text': text}));
  }
  return lines.join('\n');
}

String emotionalDirective(String mode) {
  const styles = {
    'focused': 'Be focused, warm and practical; connect the next action to the goal.',
    'calm': 'Use a calm, patient tone. Reduce pressure and offer one manageable next step.',
    'creative': 'Use a creative, energetic voice while distinguishing imagination from evidence.',
    'direct': 'Be direct and concise without being dismissive.',
  };
  if (!styles.containsKey(mode)) throw const FormatException('Unknown Nyx communication mode.');
  return 'Nyx communication preference selected by the user: ${styles[mode]} Preserve evidence, uncertainty and user agency. Do not infer a diagnosis, hidden emotional state, sentience or independent worker activity.';
}

Object? boundedJson(String text) {
  if (utf8.encode(text).length > maxDocumentBytes) throw const FormatException('Document exceeds the 2 MiB input limit.');
  var depth = 0;
  var quoted = false;
  var escaped = false;
  for (final code in text.codeUnits) {
    if (quoted) {
      if (escaped) { escaped = false; } else if (code == 92) { escaped = true; } else if (code == 34) { quoted = false; }
    } else if (code == 34) { quoted = true; } else if (code == 91 || code == 123) {
      if (++depth > 24) throw const FormatException('Document nesting exceeds 24.');
    } else if (code == 93 || code == 125) { depth--; }
  }
  return jsonDecode(text);
}

void _text(Object? value, String field, int max, {bool nonempty = false}) {
  if (value is! String || value.length > max || (nonempty && value.trim().isEmpty)) throw FormatException('Invalid $field.');
}
void _keys(Record value, Set<String> allowed) {
  if (value.keys.any((key) => !allowed.contains(key))) throw const FormatException('Unrecognized record fields.');
}
void _id(Object? value) {
  if (value is! String || !RegExp(r'^[A-Za-z0-9_-]{1,80}$').hasMatch(value)) throw const FormatException('Invalid record ID.');
}
Record validateProject(Record value) {
  _keys(value, {'id', 'title', 'goal', 'revision', 'updatedAt', 'notes', 'sources', 'artifacts'});
  _id(value['id']); _text(value['title'], 'project title', 160, nonempty: true); _text(value['goal'], 'project goal', 8000);
  final revision = value['revision'];
  if (revision is! int || revision < 0 || revision > 1000000000) throw const FormatException('Invalid project revision.');
  if (value.containsKey('notes')) _text(value['notes'], 'project notes', maxTextLength);
  if (value.containsKey('updatedAt')) _text(value['updatedAt'], 'timestamp', 64);
  for (final kind in ['sources', 'artifacts']) {
    final list = value[kind];
    if (list is! List || list.length > 128) throw FormatException('Invalid $kind list; maximum 128.');
    final ids = <String>{};
    for (final raw in list) {
      if (raw is! Map<String, dynamic>) throw const FormatException('Invalid child record.');
      _keys(raw, {'id', 'projectId', 'title', 'text', 'kind', 'url', 'at', 'digest', 'exportable', 'sourceIds', 'producer'});
      _id(raw['id']);
      if (!ids.add(raw['id'] as String) || raw['projectId'] != value['id']) throw const FormatException('Duplicate or foreign child record.');
      _text(raw['title'], 'record title', 160, nonempty: true); _text(raw['text'], 'record text', maxTextLength);
      _text(raw['kind'], 'record kind', 64, nonempty: true);
      for (final field in ['url', 'at', 'producer', 'digest']) {
        if (raw.containsKey(field)) _text(raw[field], field, field == 'url' ? 2048 : 256);
      }
      if (raw.containsKey('exportable') && raw['exportable'] is! bool) throw const FormatException('Invalid retention flag.');
      if (raw['digest'] != null && raw['digest'] != digestText(raw['text'] as String)) throw const FormatException('Content digest mismatch.');
      if (raw.containsKey('sourceIds')) {
        final refs = raw['sourceIds'];
        if (refs is! List || refs.length > 128) throw const FormatException('Invalid source references.');
        for (final ref in refs) { _id(ref); }
      }
    }
  }
  if (utf8.encode(jsonEncode(value)).length > maxDocumentBytes ~/ 2) throw const FormatException('Project exceeds 1 MiB; export and start a new project.');
  return value;
}

String packProject(Record project) {
  validateProject(project);
  final clean = Map<String, dynamic>.from(project);
  for (final field in ['sources', 'artifacts']) {
    clean[field] = (project[field] as List).where((r) => r['exportable'] != false && r['kind'] != 'x_live').toList();
  }
  final payload = jsonEncode(clean);
  return jsonEncode({'schema': 'infamy-project/v1', 'sha256': digestText(payload), 'payload': payload});
}
Record unpackProject(String text) {
  final envelope = boundedJson(text);
  if (envelope is! Record || envelope['schema'] != 'infamy-project/v1' || envelope['payload'] is! String || envelope.length != 3) throw const FormatException('Unsupported Infamy project bundle.');
  final payload = envelope['payload'] as String;
  if (digestText(payload) != envelope['sha256']) throw const FormatException('Project checksum mismatch; nothing imported.');
  final project = boundedJson(payload);
  if (project is! Record) throw const FormatException('Invalid project payload.');
  return validateProject(project);
}

Record freshProject(String title, String goal) => validateProject({'id': newId(), 'title': title.trim(), 'goal': goal.trim(), 'revision': 0, 'updatedAt': now(), 'notes': '', 'sources': <dynamic>[], 'artifacts': <dynamic>[]});
Record makeRecord(String projectId, String title, String text, {String kind = 'supplied', String url = '', List<String> sourceIds = const [], String producer = 'user', bool exportable = true}) => {'id': newId(), 'projectId': projectId, 'title': title.trim(), 'text': text, 'kind': kind, 'url': url, 'at': now(), 'digest': digestText(text), 'sourceIds': sourceIds, 'producer': producer, 'exportable': exportable};
Record cloneProject(Record project) => jsonDecode(jsonEncode(project)) as Record;
String sourceBrief(Record project, List<Record> sources) {
  final selected = sources.where((s) => s['projectId'] == project['id']).toList();
  final out = StringBuffer('# ${project['title']}\n\nGoal: ${project['goal']}\n\nLocal source inventory — deterministic, not an AI fact-check.\n');
  for (final source in selected) {
    final text = source['text'] as String;
    out.writeln('\n## ${source['title']}\nOrigin: ${source['kind']} | ${source['url'] ?? ''}\nSource: ${source['id']}\nSHA-256: ${digestText(text)}\nCharacters: ${text.length}\n\n${text.length > 1200 ? '${text.substring(0, 1200)}\n[Excerpt truncated]' : text}');
  }
  out.writeln('\n## Verification status\nOnly the selected inputs above were examined. No linked website, thread, media or external claim was independently verified.');
  return out.toString();
}
