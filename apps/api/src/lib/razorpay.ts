const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

function getBasicAuth(): string {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) throw new Error("Razorpay credentials not configured");
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

async function razorpayRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: getBasicAuth() },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${RAZORPAY_BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Razorpay ${method} ${path} failed (${res.status}): ${text}`), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export interface RazorpayContact {
  id: string;
  name: string;
  email: string;
}

export interface RazorpayFundAccount {
  id: string;
  contact_id: string;
}

export interface RazorpayPayout {
  id: string;
  status: string;
  amount: number;
  currency: string;
  fund_account_id: string;
}

export function createRazorpayOrder(amountPaise: number, receipt: string) {
  return razorpayRequest<RazorpayOrder>("/orders", "POST", {
    amount: amountPaise,
    currency: "INR",
    receipt,
  });
}

export function createRazorpayContact(name: string, email: string) {
  return razorpayRequest<RazorpayContact>("/contacts", "POST", {
    name,
    email,
    type: "customer",
  });
}

export function createRazorpayFundAccount(
  contactId: string,
  accountNumber: string,
  ifscCode: string,
  accountHolderName: string
) {
  return razorpayRequest<RazorpayFundAccount>("/fund_accounts", "POST", {
    contact_id: contactId,
    account_type: "bank_account",
    bank_account: { name: accountHolderName, account_number: accountNumber, ifsc: ifscCode },
  });
}

export function createRazorpayPayout(
  fundAccountId: string,
  amountPaise: number,
  referenceId: string
) {
  const accountNumber = process.env["RAZORPAY_ACCOUNT_NUMBER"];
  if (!accountNumber) throw new Error("RAZORPAY_ACCOUNT_NUMBER not configured");
  return razorpayRequest<RazorpayPayout>("/payouts", "POST", {
    account_number: accountNumber,
    fund_account_id: fundAccountId,
    amount: amountPaise,
    currency: "INR",
    mode: "IMPS",
    purpose: "payout",
    reference_id: referenceId,
    queue_if_low_balance: false,
  });
}
