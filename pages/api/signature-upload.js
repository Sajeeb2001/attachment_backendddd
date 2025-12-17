const SERVICEM8_API_KEY = process.env.SERVICEM8_API_KEY; // Securely stored ServiceM8 API Key
const SM8_BASE = "https://api.servicem8.com/api_1.0";
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const FormData = require("form-data");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { jobUUID, signature } = req.body;

    // Validate inputs
    if (!jobUUID) {
      return res.status(400).json({ error: "Missing 'jobUUID' in request body." });
    }
    if (!signature || !signature.startsWith("data:image")) {
      return res.status(400).json({ error: "Invalid or missing 'signature' in base64 format." });
    }

    const signatureBinary = Buffer.from(
      signature.replace(/^data:image\/\w+;base64,/, ""), // Strip "data:image/png;base64,"
      "base64"
    );

    const metadataPayload = {
      related_object: "job",
      related_object_uuid: jobUUID,
      attachment_name: `signature-${jobUUID}.png`,
      file_type: ".png", // Per documentation, include the file extension with a leading dot
      active: true // Keep the attachment active
    };

    // Step 1: Create the Attachment Record
    console.log("Sending metadata payload to ServiceM8:", metadataPayload);

    const metadataResponse = await fetch(`${SM8_BASE}/Attachment.json`, {
      method: "POST",
      headers: {
        "X-Api-Key": SERVICEM8_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(metadataPayload),
    });

    // Extract the x-record-uuid from headers
    if (!metadataResponse.ok) {
      const metadataErrorText = await metadataResponse.text();
      console.error("Metadata creation failed:", metadataErrorText);
      return res.status(metadataResponse.status).json({
        error: "Failed to create attachment metadata.",
        details: metadataErrorText,
      });
    }

    const attachmentUUID = metadataResponse.headers.get("x-record-uuid");

    // Validate that the x-record-uuid exists
    if (!attachmentUUID) {
      const metadataResponseText = await metadataResponse.text();
      console.error("Metadata creation response missing x-record-uuid header:", metadataResponseText);
      return res.status(500).json({
        error: "ServiceM8 did not return x-record-uuid in the response headers.",
        details: metadataResponseText,
      });
    }

    console.log("Attachment UUID retrieved from headers:", attachmentUUID);

    // Step 2: Upload the Binary File
    const formData = new FormData();
    formData.append("file", signatureBinary, {
      filename: `signature-${jobUUID}.png`,
      contentType: "image/png",
    });

    console.log("Uploading file to ServiceM8...");
    const fileUploadResponse = await fetch(`${SM8_BASE}/Attachment/${attachmentUUID}.file`, {
      method: "POST",
      headers: {
        "X-Api-Key": SERVICEM8_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!fileUploadResponse.ok) {
      const fileUploadResponseText = await fileUploadResponse.text();
      console.error("File upload failed:", fileUploadResponseText);
      return res.status(fileUploadResponse.status).json({
        error: "Failed to upload the file to ServiceM8.",
        details: fileUploadResponseText,
      });
    }

    console.log("File uploaded successfully!");

    return res.status(200).json({
      success: true,
      message: "File successfully uploaded to ServiceM8.",
    });
  } catch (error) {
    console.error("Unexpected server error:", error);
    return res.status(500).json({ error: "Internal server error: " + error.message });
  }
}