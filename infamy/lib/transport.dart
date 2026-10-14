import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'domain.dart';

class Transport {
  final Set<HttpClient> _clients = {};
  bool _cancelled = false;

  void cancel() {
    _cancelled = true;
    for (final client in _clients.toList()) {
      client.close(force: true);
    }
    _clients.clear();
  }

  Future<Record> request(
    Uri uri, {
    Record? body,
    Map<String, String> headers = const {},
    Duration timeout = const Duration(seconds: 45),
  }) async {
    if (_cancelled) throw StateError('Transport cancelled.');
    // Validate the destination before opening any socket.
    final target = providerUri(uri.toString());
    if (timeout <= Duration.zero) throw const FormatException('Timeout must be positive.');
    if (headers.keys.any((key) => !RegExp(r'^[A-Za-z0-9-]+$').hasMatch(key))) {
      throw const FormatException('Invalid HTTP header name.');
    }
    final client = HttpClient()..connectionTimeout = timeout;
    _clients.add(client);
    try {
      final result = await (() async {
        final req = await client.openUrl(body == null ? 'GET' : 'POST', target);
        req.followRedirects = false;
        req.headers.set(HttpHeaders.acceptHeader, 'application/json');
        for (final entry in headers.entries) {
          req.headers.set(entry.key, entry.value);
        }
        if (body != null) {
          final payload = jsonEncode(body);
          if (utf8.encode(payload).length > maxDocumentBytes) {
            throw const FormatException('Request exceeds the 2 MiB limit.');
          }
          req.headers.contentType = ContentType.json;
          req.write(payload);
        }
        final response = await req.close();
        final status = response.statusCode;
        if (status < 200 || status >= 300) {
          // Do not read or display response bodies: they can contain secrets.
          throw HttpException('HTTP $status', uri: target);
        }
        final bytes = <int>[];
        await for (final chunk in response) {
          if (bytes.length + chunk.length > maxDocumentBytes) {
            throw const FormatException('Response exceeds the 2 MiB limit.');
          }
          bytes.addAll(chunk);
        }
        final parsed = boundedJson(utf8.decode(bytes, allowMalformed: false));
        if (parsed is! Map<String, dynamic>) {
          throw const FormatException('Expected a JSON object response.');
        }
        return parsed;
      })().timeout(timeout);
      if (_cancelled) throw StateError('Transport cancelled.');
      return result;
    } on TimeoutException {
      throw TimeoutException('Request timed out.', timeout);
    } finally {
      _clients.remove(client);
      client.close(force: true);
    }
  }
}
