import 'domain.dart';
class Transport {
  void cancel() {}
  Future<Record> request(Uri uri, {Record? body, Map<String,String> headers = const {}, Duration timeout = const Duration(seconds: 45)}) async => throw UnimplementedError('request');
}
