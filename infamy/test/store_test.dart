import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:infamy/domain.dart';
import 'package:infamy/store.dart';
void main() {
  sqfliteFfiInit();
  test('saved projects retain revisions and refuse stale writes', () async {
    final store=await ProjectStore.open(databaseFactoryFfi,inMemoryDatabasePath);
    try {
      final p=freshProject('Research','Check sources');
      final first=await store.save(p,expectedRevision:0);
      expect(first['revision'],1);
      final second=await store.save({...first,'notes':'New evidence'},expectedRevision:1);
      expect(second['revision'],2);
      await expectLater(store.save({...first,'notes':'STALE'},expectedRevision:1),throwsStateError);
      expect((await store.get(p['id']))!['notes'],'New evidence');
      expect((await store.list()).length,1);
    } finally { await store.close(); }
  });
  test('imports copy IDs without altering original project or source references', () async {
    final store=await ProjectStore.open(databaseFactoryFfi,inMemoryDatabasePath);
    try {
      final p=freshProject('One','Original');
      p['sources']=[makeRecord(p['id'],'source','evidence')];
      final saved=await store.save(p,expectedRevision:0);
      final copy=await store.importCopy(packProject(saved));
      expect(copy['id'],isNot(saved['id']));
      expect(copy['sources'][0]['projectId'],copy['id']);
      expect((await store.list()).length,2);
      expect((await store.get(saved['id']))!['title'],'One');
    } finally { await store.close(); }
  });
  test('invalid child source scope is rejected before database mutation', () async {
    final store=await ProjectStore.open(databaseFactoryFfi,inMemoryDatabasePath);
    try {
      final p=freshProject('One','Goal'); p['sources']=[makeRecord('other','bad','foreign')];
      await expectLater(store.save(p,expectedRevision:0),throwsFormatException);
      expect(await store.list(),isEmpty);
    } finally { await store.close(); }
  });
}
