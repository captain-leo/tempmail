import { useState, useEffect, useCallback } from 'react';

interface Domain {
  id: string;
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
}

interface Account {
  id: string;
  address: string;
  password: string;
}

interface Token {
  id: string;
  token: string;
}

interface EmailAddress {
  address: string;
  name: string;
}

interface Email {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  intro: string;
  text: string;
  html: string[];
  createdAt: string;
  seen: boolean;
}

const API_BASE = 'https://api.mail.tm';

function App() {
  const [email, setEmail] = useState<string>('');
  const [, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState<string>('');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch available domains
  const fetchDomains = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/domains`);
      const data = await response.json();
      setDomains(data['hydra:member'] || []);
    } catch (err) {
      console.error('Failed to fetch domains:', err);
      setError('Failed to connect to email service. Please try again.');
    }
  }, []);

  // Create a new email account
  const createAccount = async (selectedDomain?: string) => {
    setCreating(true);
    setError('');
    
    try {
      // Generate random email
      const randomName = Math.random().toString(36).substring(2, 12);
      const domain = selectedDomain || (domains.length > 0 ? domains[0].domain : 'mail.tm');
      const address = `${randomName}@${domain}`;
      const password = Math.random().toString(36).substring(2, 15);

      // Create account
      const createResponse = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address, password }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData['hydra:description'] || 'Failed to create account');
      }

      const accountData: Account = await createResponse.json();
      setAccount(accountData);
      setEmail(accountData.address);

      // Get token
      const tokenResponse = await fetch(`${API_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address: accountData.address, password }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get authentication token');
      }

      const tokenData: Token = await tokenResponse.json();
      setToken(tokenData.token);

      // Save to localStorage
      localStorage.setItem('tempmail_account', JSON.stringify(accountData));
      localStorage.setItem('tempmail_password', password);
      localStorage.setItem('tempmail_token', tokenData.token);

    } catch (err: any) {
      setError(err.message || 'Failed to create email account');
    } finally {
      setCreating(false);
    }
  };

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!token) return;

    setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear session
          localStorage.removeItem('tempmail_account');
          localStorage.removeItem('tempmail_password');
          localStorage.removeItem('tempmail_token');
          setToken('');
          setAccount(null);
          setEmail('');
          setEmails([]);
          return;
        }
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();
      setEmails(data['hydra:member'] || []);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  // Fetch single message details
  const fetchMessage = async (messageId: string) => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/messages/${messageId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch message');
      }

      const data: Email = await response.json();
      setSelectedEmail(data);
      
      // Mark as seen
      await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seen: true }),
      });

    } catch (err) {
      console.error('Failed to fetch message:', err);
    } finally {
      setLoading(false);
    }
  };

  // Delete message
  const deleteMessage = async (messageId: string) => {
    if (!token) return;

    try {
      await fetch(`${API_BASE}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      setEmails(emails.filter(e => e.id !== messageId));
      if (selectedEmail?.id === messageId) {
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  // Generate new email
  const generateNewEmail = () => {
    localStorage.removeItem('tempmail_account');
    localStorage.removeItem('tempmail_password');
    localStorage.removeItem('tempmail_token');
    setToken('');
    setAccount(null);
    setEmail('');
    setEmails([]);
    setSelectedEmail(null);
    createAccount();
  };

  // Copy email to clipboard
  const copyEmail = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract OTP from email content
  const extractOTP = (text: string): string | null => {
    // Common OTP patterns
    const patterns = [
      /\b(\d{4,8})\b.*(?:code|otp|verification|confirm)/i,
      /(?:code|otp|verification|confirm).*\b(\d{4,8})\b/i,
      /\b(\d{6})\b/,
      /\b(\d{4})\b/,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  // Copy OTP
  const copyOTP = async (otp: string) => {
    await navigator.clipboard.writeText(otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Initialize on mount
  useEffect(() => {
    fetchDomains();
    
    // Check for existing session
    const savedAccount = localStorage.getItem('tempmail_account');
    const savedToken = localStorage.getItem('tempmail_token');
    
    if (savedAccount && savedToken) {
      setAccount(JSON.parse(savedAccount));
      setEmail(JSON.parse(savedAccount).address);
      setToken(savedToken);
    }
  }, [fetchDomains]);

  // Auto-refresh messages
  useEffect(() => {
    if (!token) return;
    
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, [token, fetchMessages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm bg-white/5">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Temp Mail</h1>
              <p className="text-xs text-purple-300">Real temporary email service</p>
            </div>
          </div>
          <a 
            href="https://mail.tm" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Powered by Mail.tm
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Email Address Section */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
              Your Temporary Email
            </h2>
            <button
              onClick={generateNewEmail}
              disabled={creating}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  New Email
                </>
              )}
            </button>
          </div>

          {!email && !creating ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-400 mb-4">Click the button below to generate your temporary email address</p>
              <button
                onClick={() => createAccount()}
                disabled={creating || domains.length === 0}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold transition-all disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Generate Email Address'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-800/50 rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-white font-mono text-lg">
                    {email || 'Loading...'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">This is a real working email address</p>
              </div>
              <button
                onClick={copyEmail}
                className={`p-4 rounded-xl transition-all ${
                  copied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {copied ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Inbox */}
          <div className="lg:col-span-1 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                Inbox
                {emails.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-500 text-white text-xs">
                    {emails.length}
                  </span>
                )}
              </h3>
              <button
                onClick={fetchMessages}
                disabled={refreshing || !token}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              {!token ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p>Create an email first</p>
                </div>
              ) : emails.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="relative">
                    <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    {refreshing && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-8 h-8 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    )}
                  </div>
                  <p className="mb-2">No messages yet</p>
                  <p className="text-xs">Waiting for incoming emails...</p>
                </div>
              ) : (
                emails.map((emailItem) => (
                  <button
                    key={emailItem.id}
                    onClick={() => fetchMessage(emailItem.id)}
                    className={`w-full p-4 text-left border-b border-white/5 hover:bg-white/5 transition-colors ${
                      selectedEmail?.id === emailItem.id ? 'bg-purple-500/20 border-l-2 border-l-purple-500' : ''
                    } ${!emailItem.seen ? 'bg-purple-500/10' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        !emailItem.seen ? 'bg-purple-500/30' : 'bg-slate-700'
                      }`}>
                        <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className={`text-sm truncate ${!emailItem.seen ? 'text-white font-semibold' : 'text-gray-300'}`}>
                            {emailItem.from.name || emailItem.from.address}
                          </p>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {formatDate(emailItem.createdAt)}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${!emailItem.seen ? 'text-gray-200' : 'text-gray-400'}`}>
                          {emailItem.subject || '(No subject)'}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {emailItem.intro}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Content */}
          <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Message Preview
              </h3>
              {selectedEmail && (
                <button
                  onClick={() => deleteMessage(selectedEmail.id)}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            {selectedEmail ? (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-white mb-4">
                    {selectedEmail.subject || '(No subject)'}
                  </h2>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-white font-bold">
                        {(selectedEmail.from.name || selectedEmail.from.address)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {selectedEmail.from.name || selectedEmail.from.address}
                      </p>
                      <p className="text-sm text-gray-400">
                        {selectedEmail.from.address}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        {new Date(selectedEmail.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(selectedEmail.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* OTP Detection */}
                {(() => {
                  const otp = extractOTP(selectedEmail.text || selectedEmail.intro || '');
                  if (otp) {
                    return (
                      <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-green-400 mb-1">🔑 Verification Code Detected</p>
                            <p className="text-3xl font-mono font-bold text-white tracking-widest">{otp}</p>
                          </div>
                          <button
                            onClick={() => copyOTP(otp)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${
                              copied ? 'bg-green-600 text-white' : 'bg-green-500/30 hover:bg-green-500/50 text-green-300'
                            }`}
                          >
                            {copied ? 'Copied!' : 'Copy Code'}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Email Content */}
                <div className="prose prose-invert max-w-none">
                  {selectedEmail.html && selectedEmail.html.length > 0 ? (
                    <div 
                      className="text-gray-300 email-content"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.html.join('') }}
                    />
                  ) : (
                    <pre className="text-gray-300 whitespace-pre-wrap font-sans">
                      {selectedEmail.text || selectedEmail.intro}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-8">
                <div className="text-center text-gray-500">
                  <svg className="w-20 h-20 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-lg mb-2">No message selected</p>
                  <p className="text-sm">Select a message from your inbox to view its contents</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Features Info */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-white font-semibold">Real Email</h4>
            </div>
            <p className="text-sm text-gray-400">Actually receives emails from any website or service</p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-white font-semibold">Auto OTP Detection</h4>
            </div>
            <p className="text-sm text-gray-400">Automatically detects and displays verification codes</p>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="text-white font-semibold">Instant Updates</h4>
            </div>
            <p className="text-sm text-gray-400">Auto-refreshes every 10 seconds for new messages</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-white/10 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Temp Mail - Free Temporary Email Service</p>
          <p className="mt-1">Powered by <a href="https://mail.tm" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">Mail.tm API</a></p>
        </div>
      </footer>

      <style>{`
        .email-content a {
          color: #a78bfa;
          text-decoration: underline;
        }
        .email-content img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}

export default App;
