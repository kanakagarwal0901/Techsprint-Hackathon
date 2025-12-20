require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const modelResponse = await genAI.getGenerativeModel({ model: "gemini-pro" }); 
    // We actually need to list models, but the SDK doesn't always expose a simple list method 
    // depending on version. Let's try the simplest test first:
    
    console.log("Checking connection with 'gemini-pro'...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hello, are you working?");
    const response = await result.response;
    console.log("✅ SUCCESS! 'gemini-pro' is working.");
    console.log("Response:", response.text());
    
  } catch (error) {
    console.log("❌ Error with 'gemini-pro':");
    console.error(error.message);

    console.log("\n--- TRYING 'gemini-1.5-flash' ---");
    try {
        const model2 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result2 = await model2.generateContent("Hello?");
        console.log("✅ SUCCESS! 'gemini-1.5-flash' is working.");
    } catch (err2) {
        console.log("❌ Error with 'gemini-1.5-flash':");
        console.error(err2.message);
    }
  }
}

listModels();