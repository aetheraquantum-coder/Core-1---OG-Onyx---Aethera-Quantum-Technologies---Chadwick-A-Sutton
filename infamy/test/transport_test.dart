import 'dart:io';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:infamy/transport.dart';
void main() {
  test('HTTP fixture roundtrip returns parsed JSON and rejects redirect', () async {
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    server.listen((r) async { if(r.uri.path=='/redirect'){r.response.statusCode=302;r.response.headers.set('location','http://example.invalid/secret');}else{r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'text':'ok'}));} await r.response.close(); });
    final client=Transport();
    try {
      final root='http://127.0.0.1:${server.port}';
      expect((await client.request(Uri.parse('$root/json')))['text'],'ok');
      await expectLater(client.request(Uri.parse('$root/redirect')),throwsA(isA<Exception>()));
    } finally {client.cancel();await server.close(force:true);}
  });
  test('HTTP errors never expose response secrets', () async {
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    server.listen((r) async {r.response.statusCode=401;r.response.write('SECRET RESPONSE');await r.response.close();});
    final client=Transport();
    try {
      try { await client.request(Uri.parse('http://127.0.0.1:${server.port}/')); fail('must fail'); } catch(e) {expect(e.toString(),isNot(contains('SECRET RESPONSE'))); expect(e.toString(),contains('401'));}
    } finally {client.cancel();await server.close(force:true);}
  });
  test('malformed and oversized responses fail visibly', () async {
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    server.listen((r) async {r.response.write(r.uri.path=='/large'?'x'*(2*1024*1024+1):'not json');await r.response.close();});
    final client=Transport();
    try {
      for(final path in ['large','bad']) {await expectLater(client.request(Uri.parse('http://127.0.0.1:${server.port}/$path')),throwsA(isA<Exception>()));}
    } finally {client.cancel();await server.close(force:true);}
  });
}
