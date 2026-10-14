import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:infamy/domain.dart';

void main() {
  test('X accepts canonical posts and strips only query or media suffix', () {
    expect(xPostId('https://x.com/casper/status/123456789?s=20'), '123456789');
    expect(xPostId('https://twitter.com/name/status/123456789/photo/1'), '123456789');
  });
  test('X rejects forged hosts credentials ports and non-post routes', () {
    for (final value in ['https://x.com.evil.test/a/status/123', 'https://x.com@evil.test/a/status/123', 'http://x.com/a/status/123', 'https://x.com:444/a/status/123', 'https://x.com/home']) {
      expect(() => xPostId(value), throwsFormatException, reason:value);
    }
  });
  test('provider permits HTTPS and loopback HTTP only', () {
    expect(providerUri('http://127.0.0.1:11434/v1/chat/completions').host,'127.0.0.1');
    expect(providerUri('https://api.anthropic.com/v1/messages').scheme,'https');
    for (final value in ['http://example.com/v1','https://name:secret@example.com/v1','file:///tmp/a','https://example.com/a?key=secret']) {
      expect(() => providerUri(value), throwsFormatException);
    }
  });
  test('context never crosses project boundaries', () {
    final text=contextFor('a',[{'id':'s1','projectId':'a','title':'One','text':'Allowed','kind':'supplied'},{'id':'s2','projectId':'b','title':'Two','text':'PRIVATE OTHER PROJECT','kind':'supplied'}]);
    expect(text,contains('Allowed')); expect(text,isNot(contains('PRIVATE OTHER PROJECT')));
  });
  test('Nyx emotional mode is user selected and preserves evidence', () {
    expect(emotionalDirective('calm').toLowerCase(),contains('calm'));
    expect(emotionalDirective('creative').toLowerCase(),contains('evidence'));
    expect(() => emotionalDirective('diagnose-depression'),throwsFormatException);
  });
  test('portable bundle validates payload hash and schema', () {
    final p={'id':'p1','title':'Test','goal':'Goal','revision':1,'sources':<dynamic>[],'artifacts':<dynamic>[]};
    expect(unpackProject(packProject(p))['title'],'Test');
    final envelope=jsonDecode(packProject(p)) as Map<String,dynamic>;
    envelope['payload']=(envelope['payload'] as String).replaceFirst('Test','Evil');
    expect(() => unpackProject(jsonEncode(envelope)),throwsFormatException);
    expect(() => unpackProject('{"schema":"other"}'),throwsFormatException);
  });
}
