import crypto from 'crypto';

interface FlowCreateParams {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
}

export interface FlowStatusResponse {
  flowOrder: number;
  commerceOrder: string;
  requestDate: string;
  status: number; // 1: pending, 2: paid, 3: rejected, 4: cancelled
  subject: string;
  currency: string;
  amount: string;
  payer: string;
  paymentData: {
    date: string;
    media: string;
    conversionDate: string;
    conversionRate: number;
    amount: string;
    currency: string;
    fee: string;
    balance: number;
    transferDate: string;
  } | null;
}

// 1. Signature generation logic for Flow.cl (HMAC-SHA256)
export function signParameters(
  params: Record<string, any>,
  secretKey: string
): string {
  const sortedKeys = Object.keys(params).sort();
  let signString = '';
  for (const key of sortedKeys) {
    if (key === 's') continue;
    const val = params[key];
    if (val !== undefined && val !== null) {
      signString += `${key}${val}`;
    }
  }
  
  return crypto
    .createHmac('sha256', secretKey)
    .update(signString)
    .digest('hex');
}

// 2. Fetch Helper to communicate with Flow
async function callFlowApi(
  endpoint: string,
  method: 'GET' | 'POST',
  params: Record<string, any>,
  apiKey: string,
  secretKey: string,
  sandboxMode: boolean
): Promise<any> {
  const baseUrl = sandboxMode 
    ? 'https://sandbox.flow.cl/api' 
    : 'https://www.flow.cl/api';
    
  // Append API Key
  const fullParams: Record<string, any> = { ...params, apiKey };
  // Add signature
  fullParams.s = signParameters(fullParams, secretKey);
  
  const url = `${baseUrl}${endpoint}`;
  
  let response;
  if (method === 'POST') {
    // Flow API expects form-urlencoded parameters
    const formBody = new URLSearchParams();
    for (const [key, value] of Object.entries(fullParams)) {
      formBody.append(key, String(value));
    }
    
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });
  } else {
    // GET request
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(fullParams)) {
      query.append(key, String(value));
    }
    response = await fetch(`${url}?${query.toString()}`);
  }
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Flow API error (${response.status}): ${errText}`);
  }
  
  return response.json();
}

// 3. Initiate payment
export async function createFlowPayment(
  flowConfig: { apiKey: string; secretKey: string; sandboxMode: boolean; mockMode: boolean },
  params: FlowCreateParams
): Promise<{ url: string; token: string }> {
  
  if (flowConfig.mockMode) {
    // Generate a mock token
    const mockToken = `mock_token_${crypto.randomBytes(8).toString('hex')}`;
    
    // We redirect to our local mock gateway page
    const mockRedirectUrl = `/payment/mock-gateway?token=${mockToken}&amount=${params.amount}&order=${params.commerceOrder}&urlReturn=${encodeURIComponent(params.urlReturn)}&urlConfirmation=${encodeURIComponent(params.urlConfirmation)}`;
    
    return {
      url: mockRedirectUrl,
      token: mockToken
    };
  }
  
  if (!flowConfig.apiKey || !flowConfig.secretKey) {
    throw new Error("Credenciales de Flow.cl no configuradas.");
  }
  
  const payload = {
    commerceOrder: params.commerceOrder,
    subject: params.subject,
    currency: 'CLP',
    amount: params.amount,
    email: params.email,
    urlConfirmation: params.urlConfirmation,
    urlReturn: params.urlReturn,
  };
  
  const response = await callFlowApi(
    '/payment/create',
    'POST',
    payload,
    flowConfig.apiKey,
    flowConfig.secretKey,
    flowConfig.sandboxMode
  );
  
  // Flow returns: { url: "...", token: "...", flowOrder: 12345 }
  return {
    url: `${response.url}?token=${response.token}`,
    token: response.token
  };
}

// 4. Retrieve payment status
export async function getFlowPaymentStatus(
  flowConfig: { apiKey: string; secretKey: string; sandboxMode: boolean; mockMode: boolean },
  token: string
): Promise<FlowStatusResponse> {
  
  if (flowConfig.mockMode || token.startsWith('mock_token_')) {
    // Retrieve status from mock cache or simulate success based on mock token
    // We can assume success if the simulation marked it, or mock it as paid for debugging.
    // To support a real flow simulated interaction, we will check our db.json or a temp mock payments table.
    // We can also query local mock state (which we'll save in our database).
    return {
      flowOrder: 999999,
      commerceOrder: "", // Will be filled or mapped by the caller
      requestDate: new Date().toISOString(),
      status: 2, // Default paid
      subject: "Rifa Simulada",
      currency: "CLP",
      amount: "2000",
      payer: "comprador@mock.cl",
      paymentData: null
    };
  }
  
  if (!flowConfig.apiKey || !flowConfig.secretKey) {
    throw new Error("Credenciales de Flow.cl no configuradas.");
  }
  
  const response = await callFlowApi(
    '/payment/getStatus',
    'GET',
    { token },
    flowConfig.apiKey,
    flowConfig.secretKey,
    flowConfig.sandboxMode
  );
  
  return response as FlowStatusResponse;
}
