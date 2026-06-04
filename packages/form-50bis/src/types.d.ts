export interface IncomeRow { datePaid?: string; amountPaid?: number; taxWithheld?: number; specify?: string; }
export interface Form50BisInput {
  certificate?: { bookNumber?: string; number?: string };
  payer: { taxId: string; legacyTaxId?: string; name: string; address: string };
  payee: { taxId?: string; legacyTaxId?: string; name: string; address: string };
  withholdingReturn: { formType: 'pnd1a'|'pnd1aSpecial'|'pnd2'|'pnd3'|'pnd2a'|'pnd3a'|'pnd53'; sequenceNumber?: string };
  income: IncomeRow[];
  funds?: { governmentPension?: number; socialSecurity?: number; provident?: number };
  taxPaymentCondition: { condition: 'withheldFromPayment'|'paidByPayerRecurring'|'paidByPayerOnce'|'other'; otherDetail?: string };
  issueDate: { day: string; month: string; yearBE: string };
}
