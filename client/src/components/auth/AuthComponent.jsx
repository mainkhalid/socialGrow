import React, { useState } from 'react';
import Login from './Login';
import Signup from './Signup';

const AuthComponent = () => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <>
      {isLogin ? (
        <Login onSwitchToSignup={() => setIsLogin(false)} />
      ) : (
        <Signup onSwitchToLogin={() => setIsLogin(true)} />
      )}
    </>
  );
};

export default AuthComponent;
