const express = require('express');
const router = express.Router();
const { 
  connectAccount, 
  disconnectAccount, 
  getAccounts, 
  syncAccount, 
  deleteAccount 
} = require('../controllers/accounts.controller'); 

// Get all connected accounts for authenticated user
router.get('/', getAccounts);

// Connect a new social media account
router.post('/connect', connectAccount);

// Disconnect a connected account
router.post('/:accountId/disconnect', disconnectAccount);

// Manually sync stats for a connected account
router.post('/:accountId/sync', syncAccount);

// Delete a social media account
router.delete('/:accountId', deleteAccount);

module.exports = router;
