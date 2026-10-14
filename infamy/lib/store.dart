import 'dart:convert';
import 'package:sqflite_common/sqlite_api.dart';
import 'domain.dart';

class ProjectStore {
  final Database database;
  ProjectStore._(this.database);

  static Future<ProjectStore> open(DatabaseFactory factory, String path) async {
    final db = await factory.openDatabase(path, options: OpenDatabaseOptions(
      version: 1,
      onCreate: (db, version) async {
        await db.execute('CREATE TABLE projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL)');
      },
    ));
    return ProjectStore._(db);
  }

  Future<List<Record>> list() async {
    final rows = await database.query('projects', orderBy: 'updated_at DESC, id ASC');
    return rows.map((row) => validateProject(jsonDecode(row['payload'] as String) as Record)).toList();
  }

  Future<Record?> get(String id) async {
    final rows = await database.query('projects', columns: ['payload'], where: 'id = ?', whereArgs: [id], limit: 1);
    if (rows.isEmpty) return null;
    return validateProject(jsonDecode(rows.first['payload'] as String) as Record);
  }

  Future<Record> save(Record project, {required int expectedRevision}) async {
    if (expectedRevision < 0) throw StateError('Invalid expected revision.');
    final input = cloneProject(project);
    validateProject(input); // Check scope, size and digests before any write.
    return database.transaction((txn) async {
      final rows = await txn.query('projects', columns: ['revision'], where: 'id = ?', whereArgs: [input['id']], limit: 1);
      final current = rows.isEmpty ? 0 : rows.first['revision'] as int;
      if (current != expectedRevision || input['revision'] != expectedRevision) {
        throw StateError('Project revision conflict. Reload before saving.');
      }
      input['revision'] = current + 1;
      input['updatedAt'] = now();
      validateProject(input);
      final payload = jsonEncode(input);
      if (rows.isEmpty) {
        await txn.insert('projects', {'id': input['id'], 'revision': input['revision'], 'updated_at': input['updatedAt'], 'payload': payload});
      } else {
        final changed = await txn.update('projects', {'revision': input['revision'], 'updated_at': input['updatedAt'], 'payload': payload}, where: 'id = ? AND revision = ?', whereArgs: [input['id'], current]);
        if (changed != 1) throw StateError('Project revision conflict.');
      }
      return input;
    });
  }

  Future<Record> importCopy(String bundle) async {
    final original = unpackProject(bundle);
    final copy = cloneProject(original);
    final newProjectId = newId();
    copy['id'] = newProjectId;
    copy['revision'] = 0;
    copy['updatedAt'] = now();
    final remapped = <String, String>{};
    for (final kind in ['sources', 'artifacts']) {
      for (final child in copy[kind] as List) {
        final record = child as Record;
        final oldId = record['id'] as String;
        final replacement = newId();
        remapped[oldId] = replacement;
        record['id'] = replacement;
        record['projectId'] = newProjectId;
      }
    }
    for (final kind in ['sources', 'artifacts']) {
      for (final child in copy[kind] as List) {
        final record = child as Record;
        if (record['sourceIds'] is List) {
          record['sourceIds'] = (record['sourceIds'] as List).map((id) => remapped[id] ?? id).toList();
        }
      }
    }
    return save(validateProject(copy), expectedRevision: 0);
  }

  Future<void> close() async => database.close();
}
