import 'package:sqflite_common/sqlite_api.dart';
import 'domain.dart';
class ProjectStore {
  final Database database;
  ProjectStore._(this.database);
  static Future<ProjectStore> open(DatabaseFactory factory, String path) async => throw UnimplementedError('open');
  Future<List<Record>> list() async => throw UnimplementedError('list');
  Future<Record?> get(String id) async => throw UnimplementedError('get');
  Future<Record> save(Record project, {required int expectedRevision}) async => throw UnimplementedError('save');
  Future<Record> importCopy(String bundle) async => throw UnimplementedError('importCopy');
  Future<void> close() async => database.close();
}
