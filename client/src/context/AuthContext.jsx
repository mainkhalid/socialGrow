import React, { useState, useContext, createContext, useEffect } from 'react';
import axios from 'axios';
import { 
  UserIcon, 
  LockIcon, 
  EyeIcon, 
  EyeOffIcon,
  UserPlusIcon,
  LogInIcon
} from 'lucide-react';

// Auth Context
const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // Configure axios defaults
  axios.defaults.baseURL = API_BASE_URL;

  // Helper function to get token consistently
  const getAuthToken = () => {
    // Check both possible token keys for compatibility
    return localStorage.getItem('authToken') || localStorage.getItem('token');
  };

  // Helper function to set token consistently
  const setAuthToken = (token) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('token', token); // Also set 'token' for compatibility
  };

  // Helper function to clear tokens
  const clearAuthTokens = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
  };

  // Setup axios interceptor for automatic token inclusion
  useEffect(() => {
    // Request interceptor to add auth header
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const token = getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle auth errors
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          console.log('Authentication failed, logging out...');
          clearAuthTokens();
          setUser(null);
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptors on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      // Verify token validity
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 200) {
        const userData = response.data;
        setUser(userData);
        console.log('Token verified successfully:', userData);
      } else {
        console.log('Token verification failed:', response.status);
        clearAuthTokens();
        setUser(null);
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      clearAuthTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/auth/login', {
        email,
        password
      });

      const data = response.data;

      if (response.status === 200) {
        setAuthToken(data.token);         
        await verifyToken(data.token);    
        console.log('Login successful:', data.user);
        return { success: true, user: data.user };
      } else {
        console.error('Login failed:', data.message);
        return { success: false, error: data.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const signup = async (name, email, password) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/auth/register', {
        name,
        email,
        password
      });

      const data = response.data;

      if (response.status === 200 || response.status === 201) {
        setAuthToken(data.token);
        setUser(data.user);
        console.log('Signup successful:', data.user);
        return { success: true, user: data.user };
      } else {
        console.error('Signup failed:', data.message);
        return { success: false, error: data.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      const errorMessage = error.response?.data?.message || 'Network error. Please try again.';
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuthTokens();
    setUser(null);
    console.log('User logged out');
  };

  // Get current auth token (useful for API calls)
  const getToken = () => {
    return getAuthToken();
  };

  // Get auth headers for manual API calls (if needed)
  const getAuthHeaders = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const value = {
    user,
    login,
    signup,
    logout,
    loading,
    getToken,
    getAuthHeaders,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};