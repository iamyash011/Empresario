const SHEET_ID = "YOUR_SHEET_ID";
const OTP_SHEET_NAME = "OTPs";
const DATA_SHEET_NAME = "Empresario Registrations";

function doPost(e) {
  const action = e.parameter.action;

  if (action === "sendOTP") {
    return sendOTP(e);
  } else if (action === "verifyOTP") {
    return verifyOTP(e);
  } else {
    return ContentService.createTextOutput("Invalid action");
  }
}

function sendOTP(e) {
  const email = e.parameter.email;
  const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP

  const subject = "Your OTP for Empresario Registration";
  const body = "Your OTP is: " + otp;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body,
    from: "Empresario2026@ecell-iitkgp.org",
    name: "Empresario"
  });

  return ContentService.createTextOutput("OK");
}

function verifyOTP(e) {
  // ...existing code...
}