export default async function handler(req: any, res: any) {
  try {
    const admin = await import('firebase-admin');
    res.status(200).json({
      status: 'ok',
      hasDefault: !!admin.default,
      keys: Object.keys(admin.default || admin)
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'import_error',
      message: err?.message,
      stack: err?.stack
    });
  }
}
