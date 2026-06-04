const test = require('node:test');
const assert = require('node:assert');
const { toFields, toData } = require('../src/schemaAdapter.js');

const sample = {
  certificate: { bookNumber: '1', number: '123' },
  payer: { taxId: '0105556012345', name: 'Lanna Tech Co., Ltd.', address: '123 Rd' },
  payee: { taxId: '1100987654321', legacyTaxId: '1234567890', name: 'Mr. Somchai', address: '456 Moo 7' },
  withholdingReturn: { formType: 'pnd1a', sequenceNumber: '1' },
  income: [{ datePaid: '31 Dec 2026', amountPaid: 600000, taxWithheld: 30000 }],
  funds: { socialSecurity: 9000 },
  taxPaymentCondition: { condition: 'withheldFromPayment' },
  issueDate: { day: '31', month: 'December', yearBE: '2569' },
};

test('toFields: TIN segmented, enums one-hot, income indexed, amounts stringified', () => {
  const f = toFields(sample);
  assert.strictEqual(f['payer.taxId.1'], '0');
  assert.strictEqual(f['payer.taxId.2'], '1055');
  assert.strictEqual(f['payer.taxId.3'], '56012');
  assert.strictEqual(f['payer.taxId.4'], '34');
  assert.strictEqual(f['payer.taxId.5'], '5');
  assert.strictEqual(f['payee.legacyTaxId.4'], '0');
  assert.strictEqual(f['withholdingReturn.formType.pnd1a'], '1');
  assert.strictEqual(f['taxPaymentCondition.withheldFromPayment'], '1');
  assert.strictEqual(f['income.0.amountPaid'], '600000');
  assert.strictEqual(f['payer.name'], 'Lanna Tech Co., Ltd.');
  assert.strictEqual(f['issueDate.yearBE'], '2569');
});

test('round-trip: toData(toFields(x)) preserves the populated data', () => {
  const back = toData(toFields(sample));
  assert.strictEqual(back.payer.taxId, '0105556012345');
  assert.strictEqual(back.payee.legacyTaxId, '1234567890');
  assert.strictEqual(back.withholdingReturn.formType, 'pnd1a');
  assert.strictEqual(back.taxPaymentCondition.condition, 'withheldFromPayment');
  assert.strictEqual(back.income[0].amountPaid, 600000);
  assert.strictEqual(back.certificate.bookNumber, '1');
  assert.strictEqual(back.issueDate.month, 'December');
});
