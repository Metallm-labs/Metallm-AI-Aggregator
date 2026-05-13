
import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/models/auth";
import { eq } from "drizzle-orm";

const BASE_URL = "http://localhost:3000";
const EMAIL = `test-otp-${Date.now()}@example.com`;
const PASSWORD = "password123";

async function runTest() {
    console.log(`Testing OTP Flow for ${EMAIL}...`);

    // 1. Register
    console.log("1. Registering user...");
    try {
        const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: EMAIL,
                password: PASSWORD,
                firstName: "Test",
                lastName: "OTP",
            }),
        });

        const registerData = await registerRes.json();
        console.log("Register Response:", registerRes.status, registerData);

        if (registerRes.status !== 200 || registerData.status !== "pending_verification") {
            console.error("❌ Registration failed or didn't return pending_verification");
            process.exit(1);
        }
    } catch (error) {
        console.error("❌ Failed to connect to server.", error);
        process.exit(1);
    }

    // 2. Get OTP from DB
    console.log("2. Retrieving OTP from database...");
    // Wait a bit for DB write
    await new Promise(resolve => setTimeout(resolve, 1000));

    const [user] = await db.select().from(users).where(eq(users.email, EMAIL));

    if (!user) {
        console.error("❌ User not found in database");
        process.exit(1);
    }

    if (!user.otpCode) {
        console.error("❌ OTP code not set in database");
        process.exit(1);
    }

    console.log(`✅ OTP Code found: ${user.otpCode}`);

    // 3. Verify OTP
    console.log("3. Verifying OTP...");
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: EMAIL,
            otp: user.otpCode,
        }),
    });

    const verifyData = await verifyRes.json();
    console.log("Verify Response:", verifyRes.status, verifyData);

    if (verifyRes.status === 200) {
        console.log("✅ Verification Successful!");

        // 4. Verify DB status
        const [verifiedUser] = await db.select().from(users).where(eq(users.email, EMAIL));
        if (verifiedUser && verifiedUser.isVerified) {
            console.log("✅ Database record marked as verified");
        } else {
            console.error("❌ Database record NOT marked as verified");
        }

    } else {
        console.error("❌ Verification failed");
        process.exit(1);
    }

    process.exit(0);
}

runTest().catch(console.error);
