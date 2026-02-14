# Feature: Authentication System V1

## 📌 Description
This branch (`feature/auth-system-v1`) implements the complete **Authentication System** for the Sushi & Grill Ordering App. It enables users to register with email verification (OTP), log in securely, manage their profiles, and track their order history. It also integrates authentication with the checkout flow for a seamless user experience.

## ✨ Key Features

### 1. User Registration & Login
-   **Two-Step Registration:** New users sign up with Email, Password, Name, and Phone.
-   **OTP Verification:** Integration with InsForge Auth to send and verify email OTPs.
-   **Login:** Secure login with error handling and toast notifications.
-   **Persistent Session:** Users stay logged in across refreshes.

### 2. Account Dashboard
-   **Profile Management:** Users can view and edit their personal details (Name, Phone, Address).
-   **Order History:** Displays a list of past orders placed by the user.
-   **Secure Logout:** One-click logout that clears local session and cart data.

### 3. Protected Routes
-   **AuthGuard Component:** Protects sensitive routes (like `/account`) from unauthorized access.
-   **Redirects:** Automatically redirects unauthenticated users to the Login page.

### 4. Checkout Integration
-   **Auto-Fill:** Logged-in users' details (Name, Phone, Address) are automatically filled in the checkout form.
-   **Order Linking:** Orders placed while logged in are linked to the user's account ID for future reference.

## 🛠️ Technical Changes
-   **New Dependencies:** Added `sonner` for toast notifications.
-   **State Management:** Major updates to `useAuthStore` to handle auth flow and profile data.
-   **Database:** Added `user_id` column to `orders` table (via migration/setup).
-   **UI Components:** Created `RegisterPage`, `LoginPage`, `AccountPage`, `PhoneInput`, and `AuthGuard`.

## 🧪 Testing
A comprehensive testing walkthrough has been created at [`docs/WALKTHROUGH-auth-testing.md`](./WALKTHROUGH-auth-testing.md).

### Quick Verification Steps:
1.  Go to `/register` and create a new account.
2.  Verify email using the OTP sent to your inbox (or logs in dev).
3.  Go to `/account` and update your profile phone number.
4.  Add items to cart and proceed to checkout -> verify form is auto-filled.
5.  Check `/account` again to see the new order in history.
