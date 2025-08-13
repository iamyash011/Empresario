const SHEET_ID = "YOUR_SHEET_ID";
const OTP_SHEET_NAME = "OTPs";
const DATA_SHEET_NAME = "Empresario Registrations";

function doPost(e) {
  try {
    const action = e.parameter.action;

    if (action === "sendOTP") {
      return sendOTP(e);
    } else if (action === "verifyOTP") {
      return verifyOTP(e);
    } else if (action === "register") {
      return register(e);
    } else {
      return ContentService.createTextOutput("Invalid action");
    }
  } catch (error) {
    console.error("Error in doPost:", error);
    return ContentService.createTextOutput("Server error: " + error.toString());
  }
}

function sendOTP(e) {
  try {
    const email = e.parameter.email;
    if (!email) {
      return ContentService.createTextOutput("Email is required");
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // Generate a 6-digit OTP
    
    // Store OTP in Google Sheet
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OTP_SHEET_NAME);
    if (!sheet) {
      SpreadsheetApp.openById(SHEET_ID).insertSheet(OTP_SHEET_NAME);
      const newSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OTP_SHEET_NAME);
      newSheet.getRange(1, 1, 1, 3).setValues([["Email", "OTP", "Timestamp"]]);
    }
    
    // Add OTP record
    sheet.appendRow([email, otp, new Date()]);

    const subject = "Your OTP for Empresario Registration";
    const body = `Your OTP for Empresario Registration is: ${otp}\n\nThis OTP is valid for 10 minutes.\n\nTeam Empresario\nE-Cell IIT Kharagpur`;

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      replyTo: "Empresario2026@ecell-iitkgp.org",
      name: "Empresario - E-Cell IIT Kharagpur"
    });

    return ContentService.createTextOutput("OTP sent");
  } catch (error) {
    console.error("Error in sendOTP:", error);
    return ContentService.createTextOutput("Error sending OTP: " + error.toString());
  }
}

function verifyOTP(e) {
  try {
    const email = e.parameter.email;
    const otp = e.parameter.otp;
    
    if (!email || !otp) {
      return ContentService.createTextOutput("Email and OTP are required");
    }

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(OTP_SHEET_NAME);
    if (!sheet) {
      return ContentService.createTextOutput("Invalid OTP");
    }

    const data = sheet.getDataRange().getValues();
    const now = new Date();
    
    // Find matching OTP (within last 10 minutes)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const rowEmail = row[0];
      const rowOTP = row[1];
      const timestamp = new Date(row[2]);
      
      if (rowEmail === email && rowOTP.toString() === otp.toString()) {
        const timeDiff = (now - timestamp) / (1000 * 60); // difference in minutes
        if (timeDiff <= 10) {
          return ContentService.createTextOutput("OTP valid");
        } else {
          return ContentService.createTextOutput("OTP expired");
        }
      }
    }
    
    return ContentService.createTextOutput("Invalid OTP");
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    return ContentService.createTextOutput("Error verifying OTP: " + error.toString());
  }
}

function register(e) {
  try {
    // Get or create the data sheet
    let sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(DATA_SHEET_NAME);
    if (!sheet) {
      sheet = SpreadsheetApp.openById(SHEET_ID).insertSheet(DATA_SHEET_NAME);
      // Add headers
      sheet.getRange(1, 1, 1, 22).setValues([[
        "Email", "Password", "Full Name", "Personal Email", "Phone", "Organization", "City",
        "Startup Name", "Website", "Industry", "Social Impact", "IITKGP Affiliation", "AI/ML Core",
        "TIS", "Problem", "Solution", "Market", "Traction", "Revenue", "Extra", "Submitted At", "Timestamp"
      ]]);
    }

    // Collect all form data
    const rowData = [
      e.parameter.email || "",
      e.parameter.password || "",
      e.parameter.fullName || "",
      e.parameter.personalEmail || "",
      e.parameter.phone || "",
      e.parameter.organization || "",
      e.parameter.city || "",
      e.parameter.startupName || "",
      e.parameter.website || "",
      e.parameter.industry || "",
      e.parameter.socialImpact || "",
      e.parameter.iitkgpAffiliation || "",
      e.parameter.aiMlCore || "",
      e.parameter.tis || "",
      e.parameter.problem || "",
      e.parameter.solution || "",
      e.parameter.market || "",
      e.parameter.traction || "",
      e.parameter.revenue || "",
      e.parameter.extra || "",
      e.parameter.submittedAt || "",
      new Date()
    ];

    sheet.appendRow(rowData);
    return ContentService.createTextOutput("OK");
  } catch (error) {
    console.error("Error in register:", error);
    return ContentService.createTextOutput("Registration failed: " + error.toString());
  }
}