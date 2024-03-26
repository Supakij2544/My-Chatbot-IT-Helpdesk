const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const textOnly = async (prompt) => {
  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const result = await model.generateContent(prompt);
  return result.response.text();
};

const multimodal = async (imageBinary) => {
  // For text-and-image input (multimodal), use the gemini-pro-vision model
  const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  const prompt = "ช่วยบรรยายภาพนี้ให้หน่อย";
  const mimeType = "image/png";

  // Convert image binary to a GoogleGenerativeAI.Part object.
  const imageParts = [
    {
      inlineData: {
        data: Buffer.from(imageBinary, "binary").toString("base64"),
        mimeType
      }
    }
  ];

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text();
  return text;
};

const chat = async (prompt) => {
  // For text-only input, use the gemini-pro model
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: "แนะนำตัวหน่อย",
      },
      {
        role: "model",
        parts: "สวัสดีครับ ยินดีให้บริการครับ ผมคือ Chatbot IT Helpdesk ถูกออกแบบมาเพื่อช่วยเหลือผู้ใช้เกี่ยวกับปัญหาทางด้าน IT ผมสามารถตอบคำถาม ค้นหาข้อมูล และแนะนำแนวทางแก้ไขปัญหา IT ต่างๆ เช่น ปัญหาในการใช้คอมพิวเตอร์ โปรแกรม ซอฟต์แวร์ ฮาร์ดแวร์ อินเทอร์เน็ต และอื่นๆ", 
      },
    ]
  });

  const result = await chat.sendMessage(prompt);
  return result.response.text();
};

module.exports = { textOnly, multimodal, chat };