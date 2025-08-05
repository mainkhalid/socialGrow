const axios = require("axios");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Account = require("./models/account.model");

dotenv.config();

async function updateAccountCredentials() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Check required environment variables first
    const requiredEnvVars = {
      twitter: [
        "TWITTER_API_KEY",
        "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN",
        "TWITTER_ACCESS_TOKEN_SECRET",
      ],
      facebook: [
        "FACEBOOK_APP_ID",
        "FACEBOOK_APP_SECRET",
        "FACEBOOK_ACCESS_TOKEN",
      ],
    };

    console.log("🔍 Checking environment variables...");
    let missingVars = [];

    Object.entries(requiredEnvVars).forEach(([platform, vars]) => {
      vars.forEach((varName) => {
        if (!process.env[varName]) {
          missingVars.push(`${platform.toUpperCase()}: ${varName}`);
        }
      });
    });

    if (missingVars.length > 0) {
      console.log("❌ Missing environment variables:");
      missingVars.forEach((missing) => console.log(`   - ${missing}`));
      console.log(
        "\nPlease add these to your .env file before running this script."
      );
      return;
    }

    console.log("✅ All required environment variables found");
    console.log("");

    // Get your user ID from the logs
    const userId = "686c1695cf78a9284b79c6b3";

    // Update Twitter account
    console.log("📱 Updating Twitter account...");
    const twitterAccount = await Account.findOne({
      userId: userId,
      platform: "twitter",
    });

    if (twitterAccount) {
      twitterAccount.apiKey = process.env.TWITTER_API_KEY;
      twitterAccount.apiSecret = process.env.TWITTER_API_SECRET;
      twitterAccount.accessToken = process.env.TWITTER_ACCESS_TOKEN;
      twitterAccount.accessTokenSecret =
        process.env.TWITTER_ACCESS_TOKEN_SECRET;
      twitterAccount.connected = false; // Will be validated on server restart

      await twitterAccount.save();
      console.log("   ✅ Twitter credentials updated");
      console.log(
        `   📝 API Key: ${process.env.TWITTER_API_KEY.substring(0, 8)}...`
      );
    } else {
      console.log("   ❌ Twitter account not found");
    }

    // Update Facebook account
    console.log("📱 Updating Facebook account...");
    const facebookAccount = await Account.findOne({
      userId: userId,
      platform: "facebook",
    });

    if (facebookAccount) {
      facebookAccount.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
      facebookAccount.facebookAppId = process.env.FACEBOOK_APP_ID;
      facebookAccount.facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
      facebookAccount.connected = false; // Will be validated on server restart

      // Update token expiry if provided
      if (process.env.FACEBOOK_TOKEN_EXPIRES_AT) {
        facebookAccount.tokenExpiresAt = new Date(
          process.env.FACEBOOK_TOKEN_EXPIRES_AT
        );
      }

      await facebookAccount.save();
      console.log("   ✅ Facebook credentials updated");
      console.log(`   📝 App ID: ${process.env.FACEBOOK_APP_ID}`);
      console.log(
        `   📝 Access Token: ${process.env.FACEBOOK_ACCESS_TOKEN.substring(
          0,
          20
        )}...`
      );
    } else {
      console.log("   ❌ Facebook account not found");
    }

    // Update Instagram account (uses Facebook credentials)
console.log("📱 Updating Instagram account...");
const instagramAccount = await Account.findOne({
  userId: userId,
  platform: "instagram",
});

if (instagramAccount) {
  instagramAccount.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  instagramAccount.facebookAppId = process.env.FACEBOOK_APP_ID;
  instagramAccount.facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
  instagramAccount.instagramBusinessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  instagramAccount.connected = false;

  // 🔍 Fetch Instagram username via Facebook Graph API
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (igUserId) {
    try {
      const res = await axios.get(`https://graph.facebook.com/v19.0/${igUserId}`, {
        params: {
          fields: 'username',
          access_token: process.env.FACEBOOK_ACCESS_TOKEN
        }
      });

      const igUsername = res.data.username;
      instagramAccount.username = igUsername;
      console.log(`   ✅ Fetched Instagram username: ${igUsername}`);
    } catch (error) {
      console.log("   ⚠️ Failed to fetch Instagram username from Graph API");
    }
  } else {
    console.log("   ⚠️ No Instagram Business Account ID found in env");
  }

  await instagramAccount.save();
  console.log("   ✅ Instagram credentials updated (using Facebook Graph API)");
  console.log(`   📝 Using Facebook App ID: ${process.env.FACEBOOK_APP_ID}`);
  console.log(`   📝 Using Facebook Access Token: ${process.env.FACEBOOK_ACCESS_TOKEN.substring(0, 20)}...`);
} else {
  console.log("   ❌ Instagram account not found");
}


    // Display summary
    console.log("");
    console.log("📋 CREDENTIAL UPDATE SUMMARY:");
    console.log("────────────────────────────────────────");

    const allAccounts = await Account.find({ userId: userId });
    for (const account of allAccounts) {
      console.log(`${account.platform.toUpperCase()}:`);
      console.log(`  Username: ${account.username}`);
      console.log(`  Has API Key: ${account.apiKey ? "✅" : "❌"}`);
      console.log(`  Has API Secret: ${account.apiSecret ? "✅" : "❌"}`);
      console.log(`  Has Access Token: ${account.accessToken ? "✅" : "❌"}`);
      if (account.platform === "twitter") {
        console.log(
          `  Has Access Token Secret: ${
            account.accessTokenSecret ? "✅" : "❌"
          }`
        );
      }
      if (account.platform === "instagram") {
        console.log(`  Note: Uses Facebook Graph API credentials`);
      }
      console.log("");
    }

    console.log("🎉 All credentials updated successfully!");
    console.log("");
    console.log("Next steps:");
    console.log("1. Restart your server: npm run dev");
    console.log("2. Check the connection validation in the console");
    console.log("3. If issues persist, check your .env file values");
    console.log("");
    console.log(
      "📝 Note: Instagram uses Facebook Graph API, so both platforms"
    );
    console.log(
      "   share the same Facebook App ID, App Secret, and Access Token."
    );
  } catch (error) {
    console.error("❌ Error updating credentials:", error);
  } finally {
    await mongoose.disconnect();
    console.log("📡 Disconnected from MongoDB");
  }
}

// Run the update
updateAccountCredentials();
