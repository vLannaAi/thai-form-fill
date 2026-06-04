// Pure mapping between the JSON-Schema input shape and the form's dotted field names.
// No DOM, no Vue — unit-testable in Node.
const TIN_SIZES = [1, 4, 5, 2, 1];        // payer/payee.taxId  (13 digits)
const LEGACY_SIZES = [1, 4, 4, 1];        // payer/payee.legacyTaxId (10 digits)
const FORM_TYPES = ['pnd1a', 'pnd1aSpecial', 'pnd2', 'pnd3', 'pnd2a', 'pnd3a', 'pnd53'];
const CONDITIONS = ['withheldFromPayment', 'paidByPayerRecurring', 'paidByPayerOnce', 'other'];
const INCOME_ROWS = 14;

function splitDigits(value, sizes, prefix, out) {
  var s = String(value || '');
  for (var i = 0, pos = 0; i < sizes.length; i++) { out[prefix + (i + 1)] = s.substr(pos, sizes[i]); pos += sizes[i]; }
}
function joinDigits(fields, sizes, prefix) {
  var s = '';
  for (var i = 0; i < sizes.length; i++) s += (fields[prefix + (i + 1)] || '');
  return s;
}
function numToStr(v) { return v == null || v === '' ? '' : String(v); }
function strToNum(v) { if (v == null || String(v).trim() === '') return undefined; var n = Number(String(v).replace(/[, ]/g, '')); return isNaN(n) ? undefined : n; }

function toFields(data) {
  data = data || {};
  var f = {};
  var c = data.certificate || {};
  if (c.bookNumber != null) f['certificate.bookNumber'] = String(c.bookNumber);
  if (c.number != null) f['certificate.number'] = String(c.number);

  ['payer', 'payee'].forEach(function (party) {
    var p = data[party] || {};
    if (p.taxId != null) splitDigits(p.taxId, TIN_SIZES, party + '.taxId.', f);
    if (p.legacyTaxId != null) splitDigits(p.legacyTaxId, LEGACY_SIZES, party + '.legacyTaxId.', f);
    if (p.name != null) f[party + '.name'] = String(p.name);
    if (p.address != null) f[party + '.address'] = String(p.address);
  });

  var wr = data.withholdingReturn || {};
  if (wr.sequenceNumber != null) f['withholdingReturn.sequenceNumber'] = String(wr.sequenceNumber);
  if (wr.formType) f['withholdingReturn.formType.' + wr.formType] = '1';

  (data.income || []).forEach(function (row, i) {
    if (!row) return;
    if (row.datePaid != null) f['income.' + i + '.datePaid'] = String(row.datePaid);
    if (row.amountPaid != null) f['income.' + i + '.amountPaid'] = numToStr(row.amountPaid);
    if (row.taxWithheld != null) f['income.' + i + '.taxWithheld'] = numToStr(row.taxWithheld);
    if (row.specify != null) f['income.' + i + '.specify'] = String(row.specify);
  });

  var fu = data.funds || {};
  if (fu.governmentPension != null) f['funds.governmentPension'] = numToStr(fu.governmentPension);
  if (fu.socialSecurity != null) f['funds.socialSecurity'] = numToStr(fu.socialSecurity);
  if (fu.provident != null) f['funds.provident'] = numToStr(fu.provident);

  var tc = data.taxPaymentCondition || {};
  if (tc.condition) f['taxPaymentCondition.' + tc.condition] = '1';
  if (tc.otherDetail != null) f['taxPaymentCondition.otherDetail'] = String(tc.otherDetail);

  var d = data.issueDate || {};
  if (d.day != null) f['issueDate.day'] = String(d.day);
  if (d.month != null) f['issueDate.month'] = String(d.month);
  if (d.yearBE != null) f['issueDate.yearBE'] = String(d.yearBE);
  return f;
}

function toData(fields) {
  fields = fields || {};
  var get = function (k) { return fields[k]; };
  var data = {
    certificate: { bookNumber: get('certificate.bookNumber') || '', number: get('certificate.number') || '' },
    payer: {}, payee: {},
    withholdingReturn: {},
    income: [],
    funds: {},
    taxPaymentCondition: {},
    issueDate: { day: get('issueDate.day') || '', month: get('issueDate.month') || '', yearBE: get('issueDate.yearBE') || '' },
  };
  ['payer', 'payee'].forEach(function (party) {
    data[party] = {
      taxId: joinDigits(fields, TIN_SIZES, party + '.taxId.'),
      legacyTaxId: joinDigits(fields, LEGACY_SIZES, party + '.legacyTaxId.'),
      name: get(party + '.name') || '',
      address: get(party + '.address') || '',
    };
  });
  data.withholdingReturn.sequenceNumber = get('withholdingReturn.sequenceNumber') || '';
  data.withholdingReturn.formType = FORM_TYPES.find(function (t) { return get('withholdingReturn.formType.' + t) === '1'; }) || undefined;
  for (var i = 0; i < INCOME_ROWS; i++) {
    data.income.push({
      datePaid: get('income.' + i + '.datePaid') || '',
      amountPaid: strToNum(get('income.' + i + '.amountPaid')),
      taxWithheld: strToNum(get('income.' + i + '.taxWithheld')),
      specify: get('income.' + i + '.specify'),
    });
  }
  data.funds = {
    governmentPension: strToNum(get('funds.governmentPension')),
    socialSecurity: strToNum(get('funds.socialSecurity')),
    provident: strToNum(get('funds.provident')),
  };
  data.taxPaymentCondition.condition = CONDITIONS.find(function (cc) { return get('taxPaymentCondition.' + cc) === '1'; }) || undefined;
  data.taxPaymentCondition.otherDetail = get('taxPaymentCondition.otherDetail') || '';
  return data;
}

module.exports = { toFields: toFields, toData: toData, FORM_TYPES: FORM_TYPES, CONDITIONS: CONDITIONS };
