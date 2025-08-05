const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
// Register new user
const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    // Create new user
    const user = new User({
      email,
      password,
      name,
      plan: 'pro', // Default to pro plan for demo
      planUsage: {
        posts: { used: 35, total: 100 },
        ideas: { used: 15, total: 50 }
      }
    });
    await user.save();
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        planUsage: user.planUsage
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        planUsage: user.planUsage
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (name) user.name = name;
    if (email) user.email = email;
    await user.save();
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      planUsage: user.planUsage
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
module.exports = {
  register,
  login,
  getProfile,
  updateProfile
};