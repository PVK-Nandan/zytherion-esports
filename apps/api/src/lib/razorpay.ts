import crypto from "crypto";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!;
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER!;

const authHeader = Buffer.from(
  `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
).toString("base64");

async function razorpayRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Razorpay API error ${response.status}: ${JSON.stringify(error)}`
    );
  }

  return response.json() as Promise<T>;
}

export async function createOrder(amountPaise: number, receipt: string) {
  return razorpayRequest<{ id: string; amount: number; receipt: string }>(
    "POST",
    "/orders",
    { amount: amountPaise, currency: "INR", receipt }
  );
}

export async function createPayout(
  amountPaise: number,
  fundAccountId: string,
  referenceId: string,
  narration: string
) {
  return razorpayRequest<{ id: string; status: string }>("POST", "/payouts", {
    account_number: RAZORPAY_ACCOUNT_NUMBER,
    fund_account_id: fundAccountId,
    amount: amountPaise,
    currency: "INR",
    mode: "IMPS",
    purpose: "payout",
    reference_id: referenceId,
    narration,
    queue_if_low_balance: false,
  });
}

export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
