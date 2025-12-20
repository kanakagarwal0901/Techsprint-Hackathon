const https = require('https');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ No API Key found in .env!");
    process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log("🔍 Querying Google API directly...");

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  
  res.on('end', () => {
    try {
        const response = JSON.parse(data);
        
        if (response.error) {
            console.error("\n❌ API REJECTED THE REQUEST:");
            console.error(`   Code: ${response.error.code}`);
            console.error(`   Message: ${response.error.message}`);
            console.error(`   Status: ${response.error.status}`);
            
            if (response.error.message.includes("Generative Language API has not been used")) {
                console.log("\n💡 SOLUTION: You need to ENABLE the API.");
                console.log("   Visit this link: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview");
            }
        } else {
            console.log("\n✅ SUCCESS! Here are the models you can use:");
            // Filter only for 'generateContent' capable models
            const chatModels = response.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
            chatModels.forEach(m => {
                // formatting output clearly
                console.log(`   • ${m.name.replace('models/', '')}`);
            });
            
            console.log("\n👉 Copy one of the names above into your server.js file!");
        }
    } catch (e) {
        console.error("Failed to parse response:", e);
    }
  });

}).on('error', (e) => {
  console.error("Connection error:", e);
});