import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.mjs';
import { hashPassword, session } from '../auth.mjs';
const password = 'AquaTestPassword2026!';
async function harness(gateway,walletFundingEnabled=false) {
  const {
    app,
    db
  } = await createApp({
    dbPath: ':memory:',
    gateway,
    config: {
      publicUrl: 'http://localhost:4000',walletFundingEnabled
    }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, {
    token,
    body,
    method,
    headers = {}
  } = {}) => {
    const response = await fetch(url + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {
          Authorization: `Bearer ${token}`
        } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      status: response.status,
      data
    };
  };
  const register = async (name, role = 'customer') => {
    const res = await request('/api/auth/register', {
      body: {
        name,
        email: `${name}@example.com`,
        phone: '0771234567',
        password,
        role
      }
    });
    assert.equal(res.status, 201);
    return res.data;
  };
  const id = randomUUID();
  await db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id, 'Admin', 'admin@example.com', '0771234567', await hashPassword(password), 'admin', new Date().toISOString());
  const admin = {
    user: {
      id
    },
    token: await session(db, id)
  };
  return {
    db,
    request,
    register,
    admin,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
      db.close();
    }
  };
}
async function supplierReady(h, name = 'supplier') {
  const supplier = await h.register(name, 'supplier');
  const doc = await h.request('/api/documents', {
    token: supplier.token,
    body: {
      name: 'evidence.pdf',
      mime: 'application/pdf',
      base64: Buffer.from('%PDF-1.7\nTest verification evidence').toString('base64')
    }
  });
  assert.equal(doc.status, 201);
  const profile = {
    businessName: `${name} Water`,
    type: 'tanker',
    city: 'Harare',
    serviceArea: 'Central Harare',
    waterSource: 'Borehole tested source',
    vehicle: 'Truck ABC1234',
    capacity: 10000,
    rateMicros: 12000,
    deliveryCents: 1500,
    stock: 20000,
    documentId: doc.data.id
  };
  assert.equal((await h.request('/api/supplier/profile', {
    token: supplier.token,
    body: profile,
    method: 'PUT'
  })).status, 200);
  assert.equal((await h.request(`/api/admin/suppliers/${supplier.user.id}`, {
    token: h.admin.token,
    method: 'PATCH',
    body: {
      approved: true,
      note: 'Evidence reviewed for this automated test'
    }
  })).status, 200);
  assert.equal((await h.request('/api/supplier/availability', {
    token: supplier.token,
    method: 'PATCH',
    body: {
      available: true
    }
  })).status, 200);
  return {
    supplier,
    profile
  };
}
async function place(h, customer, supplier, key = randomUUID(), extra = {}) {
  return h.request('/api/orders', {
    token: customer.token,
    headers: {
      'Idempotency-Key': key
    },
    body: {
      supplierId: supplier.user.id,
      type: 'tanker',
      quantity: 1000,
      address: '12 Main Street, Harare',
      city: 'Harare',
      paymentMethod: 'cash',
      totalCents: 1,
      ...extra
    }
  });
}
async function act(h, user, order, action, extra = {}) {
  return h.request(`/api/orders/${order.id}/action`, {
    token: user.token,
    body: {
      action,
      version: order.version,
      ...extra
    }
  });
}
async function deliver(h, customer, supplier, order) {
  for (const action of ['accept', 'depart', 'arrive']) {
    const response = await act(h, supplier, order, action);
    assert.equal(response.status, 200);
    order = response.data;
  }
  const response = await act(h, customer, order, 'receive');
  assert.equal(response.status, 200);
  return response.data;
}
test('registration, login, session revocation, roles and order privacy', async () => {
  const h = await harness();
  try {
    const a = await h.register('customer1'),
      b = await h.register('customer2');
    const {
      supplier
    } = await supplierReady(h);
    assert.equal((await h.request('/api/auth/register', {
      body: {
        name: 'Hacker',
        email: 'hack@example.com',
        phone: '0771234567',
        password,
        role: 'admin'
      }
    })).status, 400);
    assert.equal((await h.request('/api/admin/suppliers', {
      token: a.token
    })).status, 403);
    assert.equal((await h.request('/api/orders')).status, 401);
    const result = await place(h, a, supplier);
    assert.equal(result.status, 201);
    assert.equal(result.data.totalCents, 2700);
    assert.equal((await h.request(`/api/orders/${result.data.id}`, {
      token: b.token
    })).status, 403);
    assert.equal((await h.request('/api/orders', {
      token: b.token
    })).data.length, 0);
    const login = await h.request('/api/auth/login', {
      body: {
        email: 'customer1@example.com',
        password
      }
    });
    assert.equal(login.status, 200);
    assert.notEqual(login.data.token, a.token);
    assert.equal((await h.request('/api/auth/login', {
      body: {
        email: 'customer1@example.com',
        password: 'wrong'
      }
    })).status, 401);
    await h.request('/api/auth/logout', {
      token: a.token,
      body: {}
    });
    assert.equal((await h.request('/api/me', {
      token: a.token
    })).status, 401);
  } finally {
    await h.close();
  }
});
test('server prices, idempotency, capacity, city and stock reservations', async () => {
  const h = await harness();
  try {
    const customer = await h.register('buyer');
    const {
      supplier
    } = await supplierReady(h);
    const key = randomUUID();
    const first = await place(h, customer, supplier, key);
    const retry = await place(h, customer, supplier, key);
    assert.equal(first.data.id, retry.data.id);
    assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock, 19000);
    assert.equal((await place(h, customer, supplier, randomUUID(), {
      quantity: 123
    })).status, 400);
    assert.equal((await place(h, customer, supplier, randomUUID(), {
      city: 'Gweru'
    })).status, 409);
    const cancelled = await act(h, customer, first.data, 'cancel', {
      reason: 'Changed my delivery plan'
    });
    assert.equal(cancelled.status, 200);
    assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock, 20000);
    assert.equal((await act(h, customer, cancelled.data, 'cancel', {
      reason: 'Again'
    })).status, 409);
    await h.request('/api/supplier/availability', {
      token: supplier.token,
      method: 'PATCH',
      body: {
        available: false
      }
    });
    assert.equal((await place(h, customer, supplier)).status, 409);
  } finally {
    await h.close();
  }
});
test('delivery permissions, optimistic concurrency, single vehicle, cash and GPS', async () => {
  const h = await harness();
  try {
    const customer = await h.register('buyer');
    const {
      supplier
    } = await supplierReady(h);
    let order = (await place(h, customer, supplier)).data;
    assert.equal((await act(h, customer, order, 'accept')).status, 403);
    assert.equal((await act(h, customer, order, 'receive')).status, 409);
    let response = await act(h, supplier, order, 'accept');
    assert.equal(response.status, 200);
    const stale = order;
    order = response.data;
    assert.equal((await act(h, supplier, stale, 'depart')).status, 409);
    const another = (await place(h, customer, supplier)).data;
    assert.equal((await act(h, supplier, another, 'accept')).status, 409);
    order = (await act(h, supplier, order, 'depart')).data;
    assert.equal((await act(h, customer, order, 'cancel', {
      reason: 'Too late'
    })).status, 409);
    response = await h.request(`/api/orders/${order.id}/location`, {
      token: supplier.token,
      body: {
        latitude: -17.82,
        longitude: 31.05,
        accuracy: 5
      }
    });
    assert.equal(response.status, 200);
    order = response.data;
    assert.equal(order.driverLocation.latitude, -17.82);
    order = (await act(h, supplier, order, 'arrive')).data;
    order = (await act(h, customer, order, 'receive')).data;
    assert.equal((await act(h, customer, order, 'cash')).status, 403);
    order = (await act(h, supplier, order, 'cash')).data;
    assert.equal(order.paymentStatus, 'Paid');
    assert.equal((await act(h, supplier, order, 'cash')).status, 409);
    assert.equal((await act(h, customer, order, 'rate', {
      rating: 5
    })).data.rating, 5);
  } finally {
    await h.close();
  }
});
test('verification evidence is private, approval requires evidence and edits reset approval', async () => {
  const h = await harness();
  try {
    const {
      supplier,
      profile
    } = await supplierReady(h);
    const customer = await h.register('buyer');
    assert.equal((await h.request(`/api/documents/${profile.documentId}/link`, {
      token: customer.token,
      body: {}
    })).status, 403);
    assert.equal((await h.request('/api/documents', {
      token: supplier.token,
      body: {
        name: 'fake.pdf',
        mime: 'application/pdf',
        base64: Buffer.from('not pdf').toString('base64')
      }
    })).status, 400);
    const link = await h.request(`/api/documents/${profile.documentId}/link`, {
      token: h.admin.token,
      body: {}
    });
    assert.equal(link.status, 200);
    await h.request('/api/supplier/profile', {
      token: supplier.token,
      body: {
        ...profile,
        businessName: 'Changed business'
      },
      method: 'PUT'
    });
    assert.equal((await h.request('/api/suppliers', {
      token: customer.token
    })).data.length, 0);
  } finally {
    await h.close();
  }
});
test('EcoCash cannot be self-confirmed, initiates once and verifies gateway amount', async () => {
  let calls = 0;
  let paid = false;
  let mismatch = false;
  let reference = '';
  const gateway = {
    initiate: async data => {
      calls++;
      reference = data.reference;
      return {
        success: true,
        pollUrl: 'https://www.paynow.co.zw/test',
        instructions: 'Authorise payment'
      };
    },
    poll: async () => ({
      paid,
      status: paid ? 'Paid' : 'Created',
      reference,
      amountCents: mismatch ? 1 : 2700
    })
  };
  const h = await harness(gateway);
  try {
    const customer = await h.register('buyer');
    const {
      supplier
    } = await supplierReady(h);
    let order = (await place(h, customer, supplier, randomUUID(), {
      paymentMethod: 'ecocash'
    })).data;
    order = await deliver(h, customer, supplier, order);
    assert.equal((await act(h, supplier, order, 'cash')).status, 403);
    const path = `/api/orders/${order.id}/pay`;
    assert.equal((await h.request(`${path}/ecocash`, {
      token: customer.token,
      body: {
        phone: '0771234567'
      }
    })).status, 200);
    await h.request(`${path}/ecocash`, {
      token: customer.token,
      body: {
        phone: '0771234567'
      }
    });
    assert.equal(calls, 1);
    await h.request(`${path}/check`, {
      token: customer.token,
      body: {}
    });
    assert.equal((await h.request(`/api/orders/${order.id}`, {
      token: customer.token
    })).data.paymentStatus, 'Unpaid');
    paid = true;
    mismatch = true;
    assert.equal((await h.request(`${path}/check`, {
      token: customer.token,
      body: {}
    })).status, 502);
    mismatch = false;
    assert.equal((await h.request(`${path}/check`, {
      token: customer.token,
      body: {}
    })).data.state, 'Paid');
    assert.equal((await h.request(`/api/orders/${order.id}`, {
      token: customer.token
    })).data.paymentStatus, 'Paid');
  } finally {
    await h.close();
  }
});
test('SQLite users and orders survive a backend restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aquadrive-test-'));
  const path = join(directory, 'data.sqlite');
  try {
    let result = await createApp({
      dbPath: path
    });
    const id = randomUUID();
    await result.db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(id, 'Persisted', 'persist@example.com', '0771234567', await hashPassword(password), 'customer', new Date().toISOString());
    const supplierId = randomUUID();
    await result.db.prepare('INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(supplierId, 'Supplier', 'supplier-persist@example.com', '0771234567', await hashPassword(password), 'supplier', new Date().toISOString());
    await result.db.prepare('INSERT INTO suppliers(id,profile,stock) VALUES(?,?,?)').run(supplierId, JSON.stringify({
      businessName: 'Persisted supplier'
    }), 10000);
    const orderId = randomUUID();
    await result.db.prepare('INSERT INTO orders(id,customer_id,supplier_id,idempotency_key,data) VALUES(?,?,?,?,?)').run(orderId, id, supplierId, 'persistent-order-key', JSON.stringify({
      id: orderId,
      status: 'Delivered',
      paymentStatus: 'Paid',
      totalCents: 2700
    }));
    result.db.close();
    result = await createApp({
      dbPath: path
    });
    assert.equal((await result.db.prepare('SELECT name FROM users WHERE id=?').get(id)).name, 'Persisted');
    const savedOrder = JSON.parse((await result.db.prepare('SELECT data FROM orders WHERE id=?').get(orderId)).data);
    assert.equal(savedOrder.status, 'Delivered');
    assert.equal(savedOrder.totalCents, 2700);
    result.db.close();
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});
test('gateway adapter verifies signed status and recognises documented payment states', async () => {
  const {
    Paynow
  } = await import('paynow');
  const {
    createGateway
  } = await import('../gateway.mjs');
  const previousId = process.env.PAYNOW_INTEGRATION_ID,
    previousKey = process.env.PAYNOW_INTEGRATION_KEY;
  process.env.PAYNOW_INTEGRATION_ID = 'test-integration';
  process.env.PAYNOW_INTEGRATION_KEY = 'test-only-key';
  const paynow = new Paynow('test-integration', 'test-only-key');
  const gateway = createGateway('https://test.example');
  const originalFetch = globalThis.fetch;
  try {
    for (const status of ['Paid', 'Awaiting Delivery', 'Delivered', 'Disputed', 'Refunded']) {
      const payload = {
        reference: 'test-reference',
        amount: '27.00',
        status,
        pollurl: 'https://www.paynow.co.zw/test'
      };
      const hash = paynow.generateHash(payload, 'test-only-key');
      globalThis.fetch = async () => new Response(new URLSearchParams({
        ...payload,
        hash
      }).toString());
      const result = await gateway.poll('https://www.paynow.co.zw/test');
      assert.equal(result.reference, 'test-reference');
      assert.equal(result.amountCents, 2700);
      assert.equal(result.paid, ['Paid', 'Awaiting Delivery', 'Delivered'].includes(status));
    }
    globalThis.fetch = async () => new Response('reference=test&amount=27.00&status=Paid&hash=INVALID');
    await assert.rejects(() => gateway.poll('https://www.paynow.co.zw/test'));
    await assert.rejects(() => gateway.poll('https://attacker.example/test'));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousId === undefined) delete process.env.PAYNOW_INTEGRATION_ID;else process.env.PAYNOW_INTEGRATION_ID = previousId;
    if (previousKey === undefined) delete process.env.PAYNOW_INTEGRATION_KEY;else process.env.PAYNOW_INTEGRATION_KEY = previousKey;
  }
});
test('bottled orders use bottle quantities, delivery fees and available stock', async () => {
  const h = await harness();
  try {
    const buyer = await h.register('bottleBuyer');
    const {
      supplier,
      profile
    } = await supplierReady(h, 'bottleSupplier');
    const update = {
      ...profile,
      type: 'bottled',
      capacity: 24,
      rateMicros: 4000000,
      deliveryCents: 300,
      stock: 4
    };
    await h.request('/api/supplier/profile', {
      token: supplier.token,
      body: update,
      method: 'PUT'
    });
    assert.equal((await place(h, buyer, supplier, randomUUID(), {
      type: 'bottled',
      quantity: 4
    })).status, 409);
    await h.request(`/api/admin/suppliers/${supplier.user.id}`, {
      token: h.admin.token,
      method: 'PATCH',
      body: {
        approved: true,
        note: 'Bottled-water evidence reviewed for test'
      }
    });
    const result = await place(h, buyer, supplier, randomUUID(), {
      type: 'bottled',
      quantity: 4
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.totalCents, 1900);
    assert.equal((await place(h, buyer, supplier, randomUUID(), {
      type: 'bottled',
      quantity: 1
    })).status, 409);
    const cancelResult = await act(h, buyer, result.data, 'cancel', {
      reason: 'Test cancellation'
    });
    assert.equal(cancelResult.status, 200);
    assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock, 4);
  } finally {
    await h.close();
  }
});
test('arrival estimates require order access and do not leak GPS to another customer', async () => {
  const h = await harness();
  try {
    const customer = await h.register('routeCustomer'),
      stranger = await h.register('routeStranger'),
      {
        supplier
      } = await supplierReady(h, 'routeSupplier');
    const result = await h.request('/api/orders', {
      token: customer.token,
      headers: {
        'Idempotency-Key': 'routing-privacy-test'
      },
      body: {
        type: 'tanker',
        quantity: 1000,
        city: 'Harare',
        address: '12 Example Road',
        location: {
          latitude: -17.83,
          longitude: 31.05
        },
        supplierId: supplier.user.id,
        paymentMethod: 'cash'
      }
    });
    assert.equal(result.status, 201);
    const id = result.data.id;
    assert.equal((await h.request(`/api/orders/${id}/route`)).status, 401);
    assert.equal((await h.request(`/api/orders/${id}/route`, {
      token: stranger.token
    })).status, 403);
    const own = await h.request(`/api/orders/${id}/route`, {
      token: customer.token
    });
    assert.equal(own.status, 200);
    assert.equal(own.data.state, 'unavailable');
    let order = result.data;
    for (const action of ['accept', 'depart']) {
      const next = await act(h, supplier, order, action);
      assert.equal(next.status, 200);
      order = next.data;
    }
    assert.equal((await h.request(`/api/orders/${id}/location`, {
      token: supplier.token,
      body: {
        latitude: -17.82,
        longitude: 31.04,
        accuracy: 15,
        capturedAt: Date.now() - 180000
      }
    })).status, 400);
    assert.equal((await h.request(`/api/orders/${id}/location`, {
      token: supplier.token,
      body: {
        accuracy: 15
      }
    })).status, 400);
    const location = await h.request(`/api/orders/${id}/location`, {
      token: supplier.token,
      body: {
        latitude: -17.82,
        longitude: 31.04,
        accuracy: null,
        capturedAt: Date.now()
      }
    });
    assert.equal(location.status, 200);
    assert.equal(location.data.driverLocation.accuracy, null);
    assert.equal((await h.request(`/api/orders/${id}/route`, {
      token: customer.token
    })).data.state, 'unavailable');
  } finally {
    await h.close();
  }
});
test('supplier coverage separates headquarters from delivery cities and checks orders', async () => {
  const h = await harness();
  try {
    const customer = await h.register('coverageBuyer');
    const {
      supplier,
      profile
    } = await supplierReady(h, 'coverageSupplier');
    const updated = {
      ...profile,
      headquartersCity: 'Harare',
      servicesDescription: 'Bulk water for homes and construction sites',
      deliveryCities: [' Gweru ', 'gweru', 'Kwekwe']
    };
    const saved = await h.request('/api/supplier/profile', {
      token: supplier.token,
      body: updated,
      method: 'PUT'
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.deliveryCities, ['Gweru', 'Kwekwe']);
    assert.equal(saved.data.headquartersCity, 'Harare');
    assert.equal(saved.data.approved, false);
    for (const deliveryCities of [[], [''], ['Gweru', 123], Array(31).fill('Gweru')]) assert.equal((await h.request('/api/supplier/profile', {
      token: supplier.token,
      body: {
        ...updated,
        deliveryCities
      },
      method: 'PUT'
    })).status, 400);
    assert.equal((await h.request('/api/supplier/profile', {
      token: supplier.token,
      body: {
        ...updated,
        servicesDescription: ''
      },
      method: 'PUT'
    })).status, 400);
    await h.request(`/api/admin/suppliers/${supplier.user.id}`, {
      token: h.admin.token,
      method: 'PATCH',
      body: {
        approved: true,
        note: 'Coverage evidence reviewed for testing'
      }
    });
    assert.equal((await h.request('/api/suppliers?city=GW ERU', {
      token: customer.token
    })).data.length, 0);
    const matches = await h.request('/api/suppliers?city=%20gWeRu%20&type=tanker&quantity=1000', {
      token: customer.token
    });
    assert.equal(matches.data.length, 1);
    assert.equal(matches.data[0].servicesDescription, updated.servicesDescription);
    assert.equal((await h.request('/api/suppliers?city=Harare', {
      token: customer.token
    })).data.length, 0);
    assert.equal((await place(h, customer, supplier, randomUUID(), {
      city: 'Gweru'
    })).status, 201);
    assert.equal((await place(h, customer, supplier, randomUUID(), {
      city: 'Harare'
    })).status, 409);
  } finally {
    await h.close();
  }
});
test('company drivers join by single-use invitation and only assigned drivers access orders or upload GPS', async () => {
  const h = await harness();
  try {
    const customer = await h.register('fleetBuyer');
    const {
      supplier: company
    } = await supplierReady(h, 'fleetCompany');
    const {
      supplier: otherCompany
    } = await supplierReady(h, 'otherCompany');
    const enroll = async (name, owner) => {
      const invitation = await h.request('/api/company/driver-invites', {
        token: owner.token,
        body: {}
      });
      assert.equal(invitation.status, 201);
      const body = {
        name,
        email: `${name}@example.com`,
        phone: '0771234567',
        password,
        role: 'supplier',
        invitationCode: invitation.data.code
      };
      const joined = await h.request('/api/auth/register', {
        body
      });
      assert.equal(joined.status, 201);
      assert.equal(joined.data.user.role, 'driver');
      assert.equal((await h.request('/api/admin/overview',{token:joined.data.token})).status,403);
      assert.equal((await h.request('/api/admin/records/users',{token:joined.data.token})).status,403);
      assert.equal((await h.request('/api/auth/register', {
        body: {
          ...body,
          email: `repeat-${name}@example.com`
        }
      })).status, 400);
      return joined.data;
    };
    const a = await enroll('DriverOne', company),
      b = await enroll('DriverTwo', company),
      outsider = await enroll('OutsideDriver', otherCompany);
    assert.equal((await h.request('/api/supplier/profile', {
      token: a.token,
      body: {},
      method: 'PUT'
    })).status, 403);
    assert.equal((await h.request('/api/company/driver-invites', {
      token: a.token,
      body: {}
    })).status, 403);
    const vehicle = await h.request('/api/company/vehicles', {
      token: company.token,
      body: {
        description: 'Blue tanker truck',
        registration: 'ABC1234'
      }
    });
    assert.equal(vehicle.status, 201);
    const vehicle2 = await h.request('/api/company/vehicles', {
      token: company.token,
      body: {
        description: 'White tanker truck',
        registration: 'ABC5678'
      }
    });
    assert.equal(vehicle2.status, 201);
    let order = (await place(h, customer, company)).data;
    assert.equal((await act(h, company, order, 'accept')).status, 409);
    const assign = async (o, d, v, owner = company) => h.request(`/api/orders/${o.id}/assign`, {
      token: owner.token,
      body: {
        driverId: d.user.id,
        vehicleId: v.data.id,
        version: o.version
      }
    });
    assert.equal((await assign(order, outsider, vehicle)).status, 400);
    assert.equal((await assign(order, a, vehicle, otherCompany)).status, 403);
    const assigned = await assign(order, a, vehicle);
    assert.equal(assigned.status, 200);
    order = assigned.data;
    assert.equal(order.driverName, 'DriverOne');
    assert.equal(order.vehicleRegistration, 'ABC1234');
    assert.equal((await h.request(`/api/orders/${order.id}`, {
      token: b.token
    })).status, 403);
    assert.equal((await h.request(`/api/orders/${order.id}/route`, {
      token: outsider.token
    })).status, 403);
    assert.equal((await h.request('/api/orders', {
      token: a.token
    })).data.length, 1);
    assert.equal((await h.request('/api/orders', {
      token: b.token
    })).data.length, 0);
    order = (await act(h, company, order, 'accept')).data;
    const second = (await place(h, customer, company)).data;
    assert.equal((await assign(second, a, vehicle2)).status, 409);
    assert.equal((await assign(second, b, vehicle)).status, 409);
    const secondAssigned = await assign(second, b, vehicle2);
    assert.equal(secondAssigned.status, 200);
    assert.equal((await act(h, company, secondAssigned.data, 'accept')).status, 200);
    assert.equal((await act(h, company, order, 'depart')).status, 403);
    order = (await act(h, a, order, 'depart')).data;
    assert.equal(order.status, 'On the way');
    assert.equal((await assign(order, b, vehicle2)).status, 409);
    const gps = {
      latitude: -17.82,
      longitude: 31.05,
      accuracy: 5
    };
    assert.equal((await h.request(`/api/orders/${order.id}/location`, {
      token: company.token,
      body: gps
    })).status, 403);
    assert.equal((await h.request(`/api/orders/${order.id}/location`, {
      token: b.token,
      body: gps
    })).status, 403);
    const located = await h.request(`/api/orders/${order.id}/location`, {
      token: a.token,
      body: gps
    });
    assert.equal(located.status, 200);
    order = located.data;
    order = (await act(h, a, order, 'arrive')).data;
    order = (await act(h, customer, order, 'receive')).data;
    assert.equal((await act(h, a, order, 'cash')).status, 200);
  } finally {
    await h.close();
  }
});

test('admin database access, pagination, sanitized exports and audited account changes',async()=>{const h=await harness();try{
 const customer=await h.register('managed-customer');const {supplier}=await supplierReady(h,'managed-company');
 for(const path of ['/api/admin/overview','/api/admin/records/users','/api/admin/records/orders']){assert.equal((await h.request(path)).status,401);assert.equal((await h.request(path,{token:customer.token})).status,403);assert.equal((await h.request(path,{token:supplier.token})).status,403);}
 assert.equal((await h.request('/api/admin/export',{token:customer.token,body:{dataset:'users'}})).status,403);
 assert.equal((await h.request('/api/admin/records/sessions',{token:h.admin.token})).status,404);
 assert.equal((await h.request('/api/admin/records/users?page=-1',{token:h.admin.token})).status,400);
 let result=await h.request('/api/admin/records/users',{token:h.admin.token});assert.equal(result.status,200);assert.equal(result.data.total,3);assert.ok(!JSON.stringify(result.data).includes('password_hash'));
 result=await h.request('/api/admin/export',{token:h.admin.token,body:{dataset:'users'}});assert.equal(result.status,200);assert.ok(!JSON.stringify(result.data).includes('password_hash'));assert.ok(!JSON.stringify(result.data).includes(customer.token));
 assert.equal((await h.request(`/api/admin/users/${customer.user.id}`,{token:h.admin.token,method:'PATCH',body:{role:'admin',reason:'Attempt privilege escalation'}})).status,400);
 assert.equal((await h.request(`/api/admin/users/${h.admin.user.id}`,{token:h.admin.token,method:'PATCH',body:{disabled:true,reason:'Disable administrator'}})).status,403);
 result=await h.request(`/api/admin/users/${customer.user.id}`,{token:h.admin.token,method:'PATCH',body:{name:'Updated Customer',disabled:true,reason:'Suspicious account reviewed'}});assert.equal(result.status,200);assert.equal(result.data.disabled,true);assert.equal((await h.request('/api/me',{token:customer.token})).status,401);
 result=await h.request(`/api/admin/users/${customer.user.id}`,{token:h.admin.token,method:'PATCH',body:{disabled:false,reason:'Review completed and cleared'}});assert.equal(result.status,200);assert.equal((await h.request('/api/me',{token:customer.token})).status,401);
 result=await h.request('/api/auth/login',{body:{email:customer.user.email,password}});assert.equal(result.status,200);assert.equal(result.data.user.name,'Updated Customer');
 const first=(await place(h,{...customer,token:result.data.token},supplier)).data;
 result=await h.request(`/api/admin/orders/${first.id}/cancel`,{token:h.admin.token,body:{version:first.version,reason:'Duplicate delivery request'}});assert.equal(result.status,200);assert.equal(result.data.status,'Cancelled');assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock,20000);
 assert.equal((await h.request(`/api/admin/orders/${first.id}/cancel`,{token:h.admin.token,body:{version:result.data.version,reason:'Repeat cancellation'}})).status,409);
 const audit=await h.request('/api/admin/records/audit',{token:h.admin.token});assert.ok(audit.data.rows.some(r=>r.action==='Account updated'));assert.ok(audit.data.rows.some(r=>r.action==='Order cancelled'));assert.ok(audit.data.rows.some(r=>r.action==='Records exported'));
 await h.db.transaction(async()=>{for(let i=0;i<205;i++)await h.db.prepare('INSERT INTO orders(id,customer_id,supplier_id,idempotency_key,data) VALUES(?,?,?,?,?)').run('page-'+i,customer.user.id,supplier.user.id,'page-'+i,JSON.stringify({id:'page-'+i,status:'Delivered'}));});
 result=await h.request('/api/admin/records/orders?page=8',{token:h.admin.token});assert.equal(result.data.total,206);assert.equal(result.data.rows.length,6);assert.equal(result.data.hasMore,false);
 result=await h.request('/api/admin/records/users?search=Updated',{token:h.admin.token});assert.equal(result.data.total,1);
 }finally{await h.close();}});

test('concurrent order retries reserve stock once after async database conversion',async()=>{const h=await harness();try{const customer=await h.register('concurrent-buyer');const {supplier}=await supplierReady(h,'concurrent-company');const key=randomUUID();const results=await Promise.all([place(h,customer,supplier,key),place(h,customer,supplier,key)]);for(const r of results)assert.ok([200,201].includes(r.status));assert.equal(results[0].data.id,results[1].data.id);assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock,19000);}finally{await h.close();}});

test('saved addresses and preferences are private, versioned and survive account updates',async()=>{const h=await harness();try{const a=await h.register('settings-a'),b=await h.register('settings-b'),company=await h.register('settings-company','supplier');
 const defaults=await h.request('/api/account/preferences',{token:a.token});assert.equal(defaults.data.version,0);
 let result=await h.request('/api/account/preferences',{token:a.token,method:'PUT',body:{version:0,preferences:{appearance:'dark',largerText:true,contactMethod:'message',deliveryInstructions:'Call at the gate'}}});assert.equal(result.status,200);assert.equal(result.data.version,1);
 assert.equal((await h.request('/api/account/preferences',{token:a.token,method:'PUT',body:{version:0,preferences:{appearance:'light'}}})).status,409);
 assert.equal((await h.request('/api/account/preferences',{token:b.token})).data.preferences.appearance,'system');
 assert.equal((await h.request('/api/account/preferences',{token:b.token,method:'PUT',body:{version:0,preferences:{role:'admin'}}})).status,400);
 const address={label:'home',city:'Harare',address:'14 Test Road, Harare',instructions:'Tank behind the house',location:{latitude:-17.8,longitude:31.0}};
 result=await h.request('/api/account/addresses',{token:a.token,body:address});assert.equal(result.status,201);const saved=result.data;
 assert.equal((await h.request('/api/account/addresses',{token:company.token,body:address})).status,403);
 assert.equal((await h.request('/api/account/addresses',{token:b.token})).data.length,0);
 assert.equal((await h.request(`/api/account/addresses/${saved.id}`,{token:b.token,method:'PATCH',body:{version:1,archived:true}})).status,404);
 assert.equal((await h.request('/api/account/addresses',{token:a.token,body:address})).status,409);
 result=await h.request(`/api/account/addresses/${saved.id}`,{token:a.token,method:'PATCH',body:{version:1,archived:true}});assert.equal(result.status,200);assert.equal(result.data.archived,true);
 result=await h.request(`/api/account/addresses/${saved.id}`,{token:a.token,method:'PATCH',body:{version:2,archived:false}});assert.equal(result.status,200);assert.equal(result.data.location.latitude,-17.8);
 const exported=await h.request('/api/account/data-export',{token:a.token,body:{}});assert.equal(exported.data.addresses.length,1);assert.ok(!JSON.stringify(exported.data).includes('password_hash'));assert.ok(!JSON.stringify(exported.data).includes(a.token));
 }finally{await h.close();}});

test('delivery conversations enforce order access and deduplicate send retries',async()=>{const h=await harness();try{const customer=await h.register('chat-buyer'),outsider=await h.register('chat-outsider');const {supplier}=await supplierReady(h,'chat-company');const order=(await place(h,customer,supplier)).data;const key=randomUUID();
 const req={token:customer.token,body:{body:'Please use the side gate'},headers:{'Idempotency-Key':key}};assert.equal((await h.request(`/api/orders/${order.id}/messages`,req)).status,201);assert.equal((await h.request(`/api/orders/${order.id}/messages`,req)).status,201);
 let result=await h.request(`/api/orders/${order.id}/messages`,{token:supplier.token});assert.equal(result.data.rows.length,1);assert.equal(result.data.rows[0].sender_name,customer.user.name);
 assert.equal((await h.request(`/api/orders/${order.id}/messages`,{token:outsider.token})).status,403);assert.equal((await h.request(`/api/orders/${order.id}/messages`,{token:outsider.token,body:{body:'Intrusion'},headers:{'Idempotency-Key':randomUUID()}})).status,403);
 const another=(await place(h,customer,supplier)).data;assert.equal((await h.request(`/api/orders/${another.id}/messages`,req)).status,409);
 await act(h,customer,order,'cancel',{reason:'No longer needed'});assert.equal((await h.request(`/api/orders/${order.id}/messages`,{...req,headers:{'Idempotency-Key':randomUUID()}})).status,409);
 }finally{await h.close();}});

test('support replies and free membership have durable role boundaries',async()=>{const h=await harness();try{const a=await h.register('support-a'),b=await h.register('support-b');
 const result=await h.request('/api/account/support',{token:a.token,body:{category:'account',body:'I need help changing my account details'}});assert.equal(result.status,201);
 assert.equal((await h.request('/api/account/support',{token:b.token})).data.length,0);
 assert.equal((await h.request(`/api/admin/support/${result.data.id}`,{token:b.token,method:'PATCH',body:{reply:'Not allowed',status:'Resolved'}})).status,403);
 assert.equal((await h.request(`/api/admin/support/${result.data.id}`,{token:h.admin.token,method:'PATCH',body:{reply:'Please provide the corrected phone number through account support.',status:'Resolved'}})).status,200);
 assert.equal((await h.request('/api/account/support',{token:a.token})).data[0].status,'Resolved');
 assert.equal((await h.request('/api/account/membership',{token:a.token,body:{active:true}})).data.priceCents,0);assert.equal((await h.request('/api/account/membership',{token:a.token})).data.status,'Active');assert.equal((await h.request('/api/account/membership',{token:b.token})).data.status,'Not joined');assert.equal((await h.request('/api/account/membership',{token:a.token,body:{active:false}})).data.status,'Inactive');
 }finally{await h.close();}});

test('wallet funding is opt-in, verified once, isolated and reversed once',async()=>{let calls=0,paid=false,status='Pending',reference='',amount=0;const gateway={initiate:async v=>{calls++;reference=v.reference;amount=v.totalCents;return {success:true,pollUrl:'https://paynow.co.zw/status/test',instructions:'Authorize payment'};},poll:async()=>({paid,status,reference,amountCents:amount})};
 const disabled=await harness(gateway);try{const user=await disabled.register('wallet-disabled');assert.equal((await disabled.request('/api/account/wallet/topups',{token:user.token,body:{amountCents:5000,phone:'0771234567'},headers:{'Idempotency-Key':randomUUID()}})).status,503);assert.equal(calls,0);}finally{await disabled.close();}
 const h=await harness(gateway,true);try{const a=await h.register('wallet-a'),b=await h.register('wallet-b');const key=randomUUID(),req={token:a.token,body:{amountCents:10000,phone:'0771234567'},headers:{'Idempotency-Key':key}};
 const created=await h.request('/api/account/wallet/topups',req);assert.equal(created.status,201);assert.equal((await h.request('/api/account/wallet/topups',req)).status,200);assert.equal(calls,1);assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,0);
 assert.equal((await h.request('/api/account/wallet/topups',{...req,headers:{'Idempotency-Key':randomUUID()}})).status,409);
 assert.equal((await h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:b.token,body:{}})).status,403);
 paid=true;status='Awaiting Delivery';await h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}});assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,0);amount=999;paid=true;status='Paid';assert.equal((await h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}})).status,502);assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,0);amount=10000;
 const results=await Promise.all([h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}}),h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}})]);for(const r of results)assert.equal(r.status,200);
 assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,10000);assert.equal((await h.request('/api/account/wallet',{token:b.token})).data.balanceCents,0);
 const {supplier}=await supplierReady(h,'wallet-company');const order=(await place(h,a,supplier,randomUUID(),{paymentMethod:'wallet',expectedTotalCents:2700,expectedCurrency:'USD'})).data;assert.equal(order.paymentStatus,'Paid');assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,7300);
 const cancelled=await act(h,a,order,'cancel',{reason:'Changed delivery plans'});assert.equal(cancelled.data.paymentStatus,'Refunded');assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,10000);
 paid=false;status='Refunded';for(let i=0;i<2;i++)assert.equal((await h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}})).status,200);assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,0);
 paid=true;status='Paid';await h.request(`/api/account/wallet/topups/${created.data.id}/check`,{token:a.token,body:{}});assert.equal((await h.request('/api/account/wallet',{token:a.token})).data.balanceCents,0);
 }finally{await h.close();}});

test('gift deliveries require funded sender, recipient claim and recipient-only receipt',async()=>{const h=await harness();try{const sender=await h.register('gift-sender'),recipient=await h.register('gift-recipient'),outsider=await h.register('gift-outsider');const {supplier}=await supplierReady(h,'gift-company');
 assert.equal((await place(h,sender,supplier,randomUUID(),{isGift:true,paymentMethod:'cash',recipientName:'Recipient Name',recipientPhone:'0771234567'})).status,400);
 assert.equal((await place(h,sender,supplier,randomUUID(),{isGift:true,paymentMethod:'wallet',expectedTotalCents:2700,expectedCurrency:'USD',recipientName:'Recipient Name',recipientPhone:'0771234567'})).status,409);
 await h.db.prepare('INSERT INTO wallet_entries(user_id,amount_cents,currency,reference,kind,at) VALUES(?,?,?,?,?,?)').run(sender.user.id,10000,'USD','test-funded-gift','Test-only funding',new Date().toISOString());
 let order=(await place(h,sender,supplier,randomUUID(),{isGift:true,paymentMethod:'wallet',expectedTotalCents:2700,expectedCurrency:'USD',recipientName:'Recipient Name',recipientPhone:'0771234567',deliveryInstructions:'Use the side gate'})).data;assert.equal(order.paymentStatus,'Paid');order=(await act(h,supplier,order,'accept')).data;assert.equal((await act(h,supplier,order,'depart')).status,409);
 const code=(await h.request(`/api/orders/${order.id}/gift-code`,{token:sender.token,body:{}})).data.code;assert.equal((await h.request(`/api/orders/${order.id}`,{token:recipient.token})).status,403);
 const preview=await h.request('/api/account/gifts/claim',{token:recipient.token,body:{code,accept:true,preview:true}});assert.equal(preview.data.preview,true);assert.equal((await h.request(`/api/orders/${order.id}`,{token:recipient.token})).status,403);
 assert.equal((await h.request('/api/account/gifts/claim',{token:sender.token,body:{code,accept:true}})).status,400);
 const claimed=await h.request('/api/account/gifts/claim',{token:recipient.token,body:{code,accept:true}});assert.equal(claimed.status,200);order=claimed.data;assert.equal(order.recipientUserId,recipient.user.id);assert.equal((await h.request('/api/account/gifts/claim',{token:outsider.token,body:{code,accept:true}})).status,400);
 assert.equal((await h.request('/api/orders',{token:recipient.token})).data.length,1);assert.equal((await h.request(`/api/orders/${order.id}`,{token:outsider.token})).status,403);
 order=(await act(h,supplier,order,'depart')).data;order=(await act(h,supplier,order,'arrive')).data;assert.equal((await act(h,sender,order,'receive')).status,403);order=(await act(h,recipient,order,'receive')).data;assert.equal(order.status,'Delivered');
 }finally{await h.close();}});

test('wallet spending cannot race into overspend and admin cancellation refunds once',async()=>{const h=await harness();try{const buyer=await h.register('wallet-race-buyer');const {supplier}=await supplierReady(h,'wallet-race-company');await h.db.prepare('INSERT INTO wallet_entries(user_id,amount_cents,currency,reference,kind,at) VALUES(?,?,?,?,?,?)').run(buyer.user.id,3000,'USD','wallet-race-test-credit','Test-only credit',new Date().toISOString());
 const results=await Promise.all([place(h,buyer,supplier,randomUUID(),{paymentMethod:'wallet',expectedTotalCents:2700,expectedCurrency:'USD'}),place(h,buyer,supplier,randomUUID(),{paymentMethod:'wallet',expectedTotalCents:2700,expectedCurrency:'USD'})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);const order=results.find(r=>r.status===201).data;assert.equal((await h.request('/api/account/wallet',{token:buyer.token})).data.balanceCents,300);assert.equal((await h.db.prepare('SELECT stock FROM suppliers WHERE id=?').get(supplier.user.id)).stock,19000);
 const cancelled=await h.request(`/api/admin/orders/${order.id}/cancel`,{token:h.admin.token,body:{version:order.version,reason:'Customer support approved cancellation'}});assert.equal(cancelled.status,200);assert.equal(cancelled.data.paymentStatus,'Refunded');assert.equal((await h.request('/api/account/wallet',{token:buyer.token})).data.balanceCents,3000);assert.equal((await h.request(`/api/admin/orders/${order.id}/cancel`,{token:h.admin.token,body:{version:cancelled.data.version,reason:'Repeated cancellation attempt'}})).status,409);assert.equal((await h.request('/api/account/wallet',{token:buyer.token})).data.balanceCents,3000);
 }finally{await h.close();}});

test('advance delivery requests need company confirmation and retain contact preferences',async()=>{const h=await harness();try{const customer=await h.register('advance-buyer');const {supplier}=await supplierReady(h,'advance-company');const other=await h.register('advance-other','supplier');await h.request('/api/account/preferences',{token:customer.token,method:'PUT',body:{version:0,preferences:{contactMethod:'message',deliveryInstructions:'Use the front gate'}}});
 assert.equal((await place(h,customer,supplier,randomUUID(),{requestedDeliveryAt:new Date(Date.now()-1000).toISOString()})).status,400);
 let order=(await place(h,customer,supplier,randomUUID(),{requestedDeliveryAt:new Date(Date.now()+7200000).toISOString()})).data;assert.equal(order.preferredContactMethod,'message');assert.equal(order.deliveryInstructions,'Use the front gate');order=(await act(h,supplier,order,'accept')).data;assert.equal((await act(h,supplier,order,'depart')).status,409);
 assert.equal((await h.request(`/api/orders/${order.id}/schedule-confirm`,{token:customer.token,body:{version:order.version}})).status,403);assert.equal((await h.request(`/api/orders/${order.id}/schedule-confirm`,{token:other.token,body:{version:order.version}})).status,403);
 const confirmed=await h.request(`/api/orders/${order.id}/schedule-confirm`,{token:supplier.token,body:{version:order.version}});assert.equal(confirmed.status,200);order=confirmed.data;assert.equal(order.scheduleConfirmed,true);assert.equal((await act(h,supplier,order,'depart')).status,200);
 }finally{await h.close();}});
