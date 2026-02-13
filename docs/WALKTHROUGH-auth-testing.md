# 🧪 Testing Guide: Authentication System (Phase 2-5 Complete)

This guide walks you through testing the fully implemented authentication features in the Sushi & Grill app, including the new OTP Verification flow and Account Dashboard.

## ✅ Prerequisites

1.  Ensure the development server is running:
    ```bash
    npm run dev
    ```
2.  Open the app in your browser (usually `http://localhost:5173`).

---

## 1. User Registration Flow (Two-Step OTP)

**Goal:** Verify a new user can create an account using the verified email flow.

1.  **Navigate:** Click **"دخول" (Login)** -> **"إنشاء حساب جديد"** (Create Account) or go to `/register`.

### Step 1: Initial Form
1.  **Fill Details:**
    *   **Name:** Enter a test name.
    *   **Email:** Enter a valid email (you will need to access this email to simulate OTP, or check InsForge logs if in dev mode).
    *   **Phone:** Enter a valid Egyptian mobile number (11 digits, e.g., `01012345678`).
    *   **Password:** Enter a password (min. 6 chars).
    *   **Address:** (Optional) Enter a test address.
2.  **Action:** Click **"متابعة"** (Continue).
3.  **Result:** The form should slide to the Verification Step.

### Step 2: OTP Verification
1.  **Check Email:** Look for the verification code sent by InsForge.
    *   *Dev Note: If configured for dev, checks logs or use specific test OTP.*
2.  **Enter Code:** Complete the 6-digit OTP in the input fields.
    *   *Test:* Try pasting the code (Ctrl+V).
3.  **Action:** Click **"تأكيد وإنشاء الحساب"** (Confirm & Create).
4.  **Expected Result:**
    *   🎉 Success toast message.
    *   Redirects to the **Home Page**.
    *   **Header Update:** Shows your **First Name** (e.g., "Yousef").

---

## 2. Login Flow

**Goal:** Verify an existing user can log in.

1.  **Prerequisite:** Ensure you are logged out.
2.  **Navigate:** Click **"دخول"** or go to `/login`.
3.  **Fill Form:** Use your registered credentials.
4.  **Action:** Click **"تسجيل الدخول"**.
5.  **Expected Result:**
    *   🎉 Success toast message.
    *   Redirects to the **Home Page**.
    *   **Header Update:** Shows your name.

---

## 3. Account Management (Profile)

**Goal:** Verify a user can update their profile.

1.  **Navigate:** Click your **Name** in the header to go to `/account`.
2.  **Action:** Click **"تعديل البيانات"**.
3.  **Action:** Change your **Address** or **Phone**.
4.  **Save:** Click **"حفظ التعديلات"**.
5.  **Result:** Form updates with new data. Success indicator appears.

---

## 4. Protected Route (Security)

**Goal:** Verify security guard.

1.  **Action:** Log out.
2.  **Navigate:** Manually visit `/account`.
3.  **Result:** Immediate redirect to `/login`.

---

## 5. Order History & Checkout Integration

**Goal:** Verify orders are linked to the user.

1.  **Prerequisite:** Log in with a test account.
2.  **Action:** Place a new order via the cart checkout.
    *   *Note:* The checkout form should **auto-fill** with your name and address!
3.  **Navigate:** Go to `/account` -> **"طلباتي" (My Orders)** tab.
4.  **Result:**
    *   The order you just placed should appear in the list.
    *   Status should be "New" (or similar).

---

## 6. Logout Flow

**Goal:** Verify secure logout.

1.  **Action:** Click **"خروج" (Logout)** in the Account page header.
2.  **Result:** Redirect to Home. Session cleared.
