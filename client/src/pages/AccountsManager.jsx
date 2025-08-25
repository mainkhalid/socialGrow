import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import {
  KeyIcon,
  ShieldCheckIcon,
  PlusCircleIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
} from "lucide-react";

const AccountsManager = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [formError, setFormError] = useState("");
  const [newAccount, setNewAccount] = useState({
    platform: "twitter",
    username: "",
    apiKey: "",
    apiSecret: "",
    accessToken: "",
  });

  const { isAuthenticated, getAuthHeaders, user } = useAuth();

  const platformLabels = {
    twitter: "X (Twitter)",
    instagram: "Instagram",
    facebook: "Facebook",
  };

  const platformColors = {
    twitter: "bg-blue-500 text-white",
    instagram: "bg-pink-500 text-white",
    facebook: "bg-indigo-500 text-white",
  };

  const platformIcons = {
    twitter: (
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
        X
      </div>
    ),
    instagram: (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold">
        IG
      </div>
    ),
    facebook: (
      <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
        FB
      </div>
    ),
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setError("");

      console.log("Fetching accounts...", { isAuthenticated, user });

      const response = await axios.get("/api/accounts");
      console.log("Accounts response:", response.data);

      const accountsData = response.data.accounts || response.data || [];
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
    } catch (err) {
      console.error("Fetch accounts error:", err);

      if (err.response?.status === 401) {
        setError("Authentication failed. Please log in again.");
      } else if (err.response?.status === 403) {
        setError("Access denied. Insufficient permissions.");
      } else if (err.response?.status === 404) {
        setError(
          "Accounts endpoint not found. Please check your API configuration."
        );
      } else {
        const errorMsg =
          err.response?.data?.message ||
          err.message ||
          "Failed to fetch accounts";
        setError(errorMsg);
      }

      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleConnection = async (accountId) => {
    try {
      console.log("Toggling connection for account:", accountId);

      const response = await axios.patch(`/api/accounts/${accountId}/toggle`);
      console.log("Toggle response:", response.data);

      await fetchAccounts();
    } catch (err) {
      console.error("Toggle connection error:", err);
      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        "Failed to toggle connection";
      alert(errorMsg);
    }
  };

  const deleteAccount = async (accountId) => {
    if (!window.confirm("Are you sure you want to delete this account?"))
      return;

    try {
      console.log("Deleting account:", accountId);

      const response = await axios.delete(`/api/accounts/${accountId}`);
      console.log("Delete response:", response.data);

      setAccounts(accounts.filter((acc) => acc._id !== accountId));
    } catch (err) {
      console.error("Delete account error:", err);
      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        "Failed to delete account";
      alert(errorMsg);

      fetchAccounts();
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewAccount({
      ...newAccount,
      [name]: value,
    });
    if (formError) setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!newAccount.username || !newAccount.apiKey || !newAccount.apiSecret) {
      setFormError("All required fields must be filled");
      return;
    }

    try {
      // Here you would make the actual API call to add the account
      // For now, simulating with a timeout
      setTimeout(() => {
        setNewAccount({
          platform: "twitter",
          username: "",
          apiKey: "",
          apiSecret: "",
          accessToken: "",
        });
        setShowAddForm(false);
        fetchAccounts(); // Refresh the accounts list
      }, 1000);
    } catch (err) {
      setFormError("Failed to add account. Please try again.");
    }
  };

  const maskString = (str) => {
    if (!str) return "";
    return str.substring(0, 4) + "••••••••••••" + str.substring(str.length - 4);
  };

  useEffect(() => {
    if (isAuthenticated) {
      console.log("User authenticated, fetching accounts...");
      fetchAccounts();
    } else {
      console.log("User not authenticated");
      setLoading(false);
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <ShieldCheckIcon size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-gray-500">
            Please log in to view your social media accounts.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <RefreshCwIcon size={48} className="mx-auto mb-4 text-gray-300 animate-spin" />
          <h2 className="text-xl font-semibold mb-2">Loading accounts...</h2>
          <p className="text-gray-500">
            Please wait while we fetch your connected accounts.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
          <div className="p-4 sm:p-6 bg-red-50 border-b border-red-200">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Error Loading Accounts
            </h3>
            <p className="text-red-600 text-sm sm:text-base">{error}</p>
          </div>
          <div className="p-4 sm:p-6">
            <button
              onClick={fetchAccounts}
              className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center"
            >
              <RefreshCwIcon size={16} className="mr-2" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            Connected Social Media Accounts
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Manage your social media connections and API credentials
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={fetchAccounts}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center"
          >
            <RefreshCwIcon size={16} sm:size={18} className="mr-1" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center"
          >
            <PlusCircleIcon size={16} sm:size={18} className="mr-1" />
            Add Account
          </button>
        </div>
      </header>

      {accounts.length === 0 ? (
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <ShieldCheckIcon size={48} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg sm:text-xl font-semibold mb-2">No Accounts Connected</h2>
          <p className="text-gray-500 mb-4 text-sm sm:text-base">
            You haven't connected any social media accounts yet.
          </p>
          <p className="text-xs sm:text-sm text-gray-400 mb-6">
            User ID: {user?.userId || user?.id || "Unknown"}
            <br />
            Total accounts in response: {accounts.length}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
          >
            Connect Your First Account
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div>
                <h2 className="font-medium">Connected Accounts</h2>
                <p className="text-xs sm:text-sm text-gray-500">
                  Found {accounts.length} account(s) for user:{" "}
                  {user?.email || user?.name || "Unknown"}
                </p>
              </div>
              <div className="flex items-center">
                <button
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="flex items-center text-sm text-gray-500 hover:text-gray-700"
                >
                  {showSecrets ? (
                    <>
                      <EyeOffIcon size={14} className="mr-1" />
                      Hide Credentials
                    </>
                  ) : (
                    <>
                      <EyeIcon size={14} className="mr-1" />
                      Show Credentials
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <div key={account._id || account.id} className="p-4">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0">
                    {platformIcons[account.platform] || (
                      <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold">
                        ?
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center mb-2 gap-1 sm:gap-2">
                      <h3 className="font-medium text-gray-900 truncate">
                        @{account.username || account.displayName || "Unknown"}
                      </h3>
                      <span
                        className={`inline-flex px-2 py-1 text-xs rounded-full self-start ${
                          account.connected
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {account.connected ? "✅ Connected" : "❌ Disconnected"}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mb-3">
                      {account.platform?.toUpperCase() || "Unknown Platform"}
                      {account.syncStatus && (
                        <span className="block sm:inline sm:ml-2">
                          • Status: {account.syncStatus.status}
                          {account.syncStatus.error &&
                            ` - ${account.syncStatus.error}`}
                        </span>
                      )}
                    </p>
                    {/* API Credentials Display */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-3">
                      <div className="bg-gray-50 p-2 rounded-md">
                        <p className="text-xs text-gray-500 mb-1">API Key</p>
                        <p className="text-xs font-mono break-all">
                          {showSecrets
                            ? account.apiKey || "Not provided"
                            : maskString(account.apiKey || "Not provided")}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-md">
                        <p className="text-xs text-gray-500 mb-1">API Secret</p>
                        <p className="text-xs font-mono break-all">
                          {showSecrets
                            ? account.apiSecret || "Not provided"
                            : maskString(account.apiSecret || "Not provided")}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-md sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-gray-500 mb-1">
                          Access Token
                        </p>
                        <p className="text-xs font-mono break-all">
                          {showSecrets
                            ? account.accessToken || "Not provided"
                            : maskString(account.accessToken || "Not provided")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleConnection(account._id || account.id)}
                      className={`p-2 rounded-md ${
                        account.connected
                          ? "text-red-500 hover:bg-red-50"
                          : "text-green-500 hover:bg-green-50"
                      }`}
                      title={account.connected ? "Disconnect" : "Connect"}
                    >
                      {account.connected ? (
                        <XCircleIcon size={18} />
                      ) : (
                        <CheckCircleIcon size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => deleteAccount(account._id || account.id)}
                      className="p-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"
                      title="Remove Account"
                    >
                      <TrashIcon size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-bold">Connect New Account</h2>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormError("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {["twitter", "instagram", "facebook"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setNewAccount({
                          ...newAccount,
                          platform: p,
                        })
                      }
                      className={`p-2 sm:p-3 rounded-lg flex items-center justify-center text-sm ${
                        newAccount.platform === p
                          ? platformColors[p]
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {platformLabels[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={newAccount.username}
                  onChange={handleInputChange}
                  className="w-full border border-gray-300 rounded-lg p-2 sm:p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`Your ${platformLabels[newAccount.platform]} username`}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showSecrets ? "text" : "password"}
                    name="apiKey"
                    value={newAccount.apiKey}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-lg p-2 sm:p-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your API key"
                  />
                  <KeyIcon
                    size={16}
                    className="absolute right-3 top-3 text-gray-400"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Secret
                </label>
                <div className="relative">
                  <input
                    type={showSecrets ? "text" : "password"}
                    name="apiSecret"
                    value={newAccount.apiSecret}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-lg p-2 sm:p-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your API secret"
                  />
                  <ShieldCheckIcon
                    size={16}
                    className="absolute right-3 top-3 text-gray-400"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showSecrets ? "text" : "password"}
                    name="accessToken"
                    value={newAccount.accessToken}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-lg p-2 sm:p-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your access token if available"
                  />
                  <ShieldCheckIcon
                    size={16}
                    className="absolute right-3 top-3 text-gray-400"
                  />
                </div>
              </div>
              {formError && (
                <div className="mb-4 p-3 bg-red-50 text-red-500 rounded-md text-sm border border-red-200">
                  {formError}
                </div>
              )}
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormError("");
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg text-white ${
                    newAccount.platform === "twitter"
                      ? "bg-blue-500 hover:bg-blue-600"
                      : newAccount.platform === "instagram"
                      ? "bg-pink-500 hover:bg-pink-600"
                      : "bg-indigo-500 hover:bg-indigo-600"
                  }`}
                >
                  Connect Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-6 sm:mt-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="font-medium text-gray-800 mb-2">
          About API Credentials
        </h3>
        <p className="text-sm text-gray-600 mb-2">
          To connect your social media accounts, you'll need to obtain API
          credentials from each platform's developer portal:
        </p>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li>
            X (Twitter):{" "}
            <a
              href="https://developer.twitter.com/"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Twitter Developer Portal
            </a>
          </li>
          <li>
            Instagram:{" "}
            <a
              href="https://developers.facebook.com/"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Meta for Developers
            </a>
          </li>
          <li>
            Facebook:{" "}
            <a
              href="https://developers.facebook.com/"
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Meta for Developers
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AccountsManager;