import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Firestore Security Rules Static Integrity & Branch Isolation', () => {
  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('strictly disallows direct client-side order creation', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    const ordersBlock = ordersMatch![0];

    expect(ordersBlock).toMatch(/allow\s+create:\s*if\s+false\s*;/);
    expect(ordersBlock).not.toContain('request.resource.data.total > 0');
  });

  it('strictly isolates idempotency records from client access', () => {
    const idempMatch = rulesContent.match(/match\s+\/idempotency_records\/\{recordId\}[\s\S]*?\n\s*\}/);
    expect(idempMatch).toBeDefined();
    expect(idempMatch![0]).toMatch(/allow\s+read,\s*write:\s*if\s+false\s*;/);
  });

  it('prevents order deletion to maintain audit trails', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    expect(ordersMatch![0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/);
  });

  it('enforces branch isolation on order reading and updating', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    const ordersBlock = ordersMatch![0];

    // Read and list require canAccessBranch or global admin
    expect(ordersBlock).toContain('canAccessBranch(resource.data.branch)');
    expect(ordersBlock).toContain('isGlobalAdmin()');
  });

  it('restricts order updates to authorized branch staff and immutable financial fields', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    const ordersBlock = ordersMatch![0];

    expect(ordersBlock).toContain('canAccessBranch(resource.data.branch)');
    expect(ordersBlock).toContain("hasOnly(['status', 'updated_at', 'server_timestamp', 'kitchen_notes'])");
    expect(ordersBlock).toContain('request.resource.data.total == resource.data.total');
    expect(ordersBlock).toContain('request.resource.data.customer_phone == resource.data.customer_phone');
    expect(ordersBlock).toContain('request.resource.data.branch == resource.data.branch');
  });

  it('strictly restricts /admins and /settings write operations to Global Administrators only', () => {
    const adminsMatch = rulesContent.match(/match\s+\/admins\/\{adminId\}[\s\S]*?\n\s*\}/);
    expect(adminsMatch).toBeDefined();
    expect(adminsMatch![0]).toMatch(/allow\s+write:\s*if\s+isGlobalAdmin\(\)\s*;/);

    const settingsMatch = rulesContent.match(/match\s+\/settings\/\{settingId\}[\s\S]*?\n\s*\}/);
    expect(settingsMatch).toBeDefined();
    expect(settingsMatch![0]).toContain('isGlobalAdmin()');
  });

  it('enforces is_active: true requirement for active administrative documents', () => {
    const activeDocFunc = rulesContent.match(/function\s+hasActiveAdminDoc\(\)[\s\S]*?\n\s*\}/);
    expect(activeDocFunc).toBeDefined();
    const funcBlock = activeDocFunc![0];

    expect(funcBlock).toContain('getAdminDoc().data.is_active == true');
    expect(funcBlock).toContain('exists(/databases/$(database)/documents/admins/$(request.auth.uid))');
  });

  it('correctly maps branch tokens and scopes to corresponding branch names', () => {
    const branchScopeFunc = rulesContent.match(/function\s+getAdminBranchScope\(\)[\s\S]*?\n\s*\}/);
    expect(branchScopeFunc).toBeDefined();
    const funcBlock = branchScopeFunc![0];

    expect(funcBlock).toContain("request.auth.token.role == 'stadium_admin' ? 'فرع الاستاد'");
    expect(funcBlock).toContain("request.auth.token.role == 'caravan_admin' ? 'فرع الكرفان'");
  });
});
