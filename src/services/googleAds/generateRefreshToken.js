require("dotenv").config();
const { google } = require("googleapis");
const readline = require("readline");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  "http://localhost:3000/oauth2callback",
);

const scopes = ["https://www.googleapis.com/auth/adwords"];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: scopes,
  prompt: "consent",
  // Some accounts complain if response_type isn't explicit
  response_type: "code",
});

console.log("Go to this URL and authorize:");
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("\nPaste the code here: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("\nYour REFRESH TOKEN:");
    console.log(tokens.refresh_token);
  } catch (err) {
    console.error("Error retrieving token:", err);
  }
  rl.close();
});

