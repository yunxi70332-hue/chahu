# -*- coding: utf-8 -*-
# v2.4 订单利润链路回归:建单快照 → 字段裁剪 → 议价负利润 → 总部单笔打款 → 看板利润卡
import json
import urllib.request
import urllib.error

BASE = 'http://localhost:3001/api'


def api(method, path, token=None, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode('utf-8') if body is not None else None,
        method=method,
        headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})},
    )
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        return {'_status': e.code, '_body': e.read().decode('utf-8', 'replace')}


admin = api('POST', '/auth/login', body={'phone': '13800000001', 'password': 'admin123'})['data']['token']
member = api('POST', '/auth/login', body={'phone': '13800000003', 'password': 'member123'})['data']['token']

# 找一个上游价明确的手机产品
prods = api('GET', '/products?available=1&pageSize=500', admin)['data']['list']
p = next(x for x in prods if x['category'] == '手机' and x['upstreamPrice'] and x['upstreamPrice'] > 1000)
print(f"选中产品 id={p['id']} 上游={p['upstreamPrice']} 代理价={p['price']}")

bal_before = api('GET', '/auth/me', member)['data']['balance']

# 1) 会员默认价建单:响应里不得出现上游价/利润
r1 = api('POST', '/orders', member, {'productId': p['id'], 'quantity': 2})
o1 = r1['data']
print('1) 会员建单响应无上游/利润字段:', 'upstreamPrice' not in o1 and 'profit' not in o1,
      '| 单价=', o1['unitPrice'], '合计=', o1['totalAmount'])

# 2) 管理员视角:快照与利润
lst = api('GET', '/orders?keyword=' + o1['orderNo'], admin)['data']['list']
a1 = next(x for x in lst if x['id'] == o1['id'])
expect = round((p['upstreamPrice'] - p['price']) * 2, 2)
print('2) 管理员视角 upstream=', a1['upstreamPrice'], 'profit=', a1['profit'],
      '| 与 (上游-代理价)x2 相符:', abs(a1['profit'] - expect) < 0.01)

# 3) 议价高于上游:允许提交,利润为负
r2 = api('POST', '/orders', member, {'productId': p['id'], 'quantity': 1, 'unitPrice': p['upstreamPrice'] + 100})
o2 = r2['data']
lst2 = api('GET', '/orders?keyword=' + o2['orderNo'], admin)['data']['list']
a2 = next(x for x in lst2 if x['id'] == o2['id'])
print('3) 议价单 unitPrice=', o2['unitPrice'], 'profit=', a2['profit'], '| 为负:', a2['profit'] < 0)
print('   删除议价测试单:', api('DELETE', '/orders/' + str(o2['id']), member)['data'])

# 4) 总部审核通过:余额 += 货款,单笔 ORDER 流水,无佣金
api('POST', '/orders/%d/approve' % o1['id'], admin, {})
bal_after = api('GET', '/auth/me', member)['data']['balance']
txs = api('GET', '/transactions?pageSize=10', member)['data']['list']
newtx = [t for t in txs if t.get('order') and t['order'].get('orderNo') == o1['orderNo']]
print('4) 审核通过: 余额变动=', round(bal_after - bal_before, 2), '货款=', o1['totalAmount'],
      '| 相符:', abs(bal_after - bal_before - o1['totalAmount']) < 0.01)
print('   该单新流水:', [(t['type'], t['amount']) for t in newtx], '(应只有 1 笔 ORDER)')

# 5) 看板:管理员有 todayProfit;会员不下发
dcards = api('GET', '/dashboard/stats', admin)['data']['cards']
mcards = api('GET', '/dashboard/stats', member)['data']['cards']
print('5) 看板 admin todayProfit=', dcards.get('todayProfit'), '| member 无此字段:', 'todayProfit' not in mcards)
