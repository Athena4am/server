// Middleware de autenticación: valida el token JWT del usuario de Supabase.
//
// El launcher envía la sesión del usuario autenticado en el header
// `Authorization: Bearer <access_token>`. Este middleware lo verifica
// contra el endpoint de Supabase y expone el usuario en `req.authUser`.

const SUPABASE_URL = "https://xqciusfoejbfsukkgqre.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_qqUSgyxULZQ47e7Zsns-CA_g7OpwbgL";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return res.status(401).json({
      error: "No autenticado. Falta el token.",
    });
  }

  try {
    const respuesta = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      },
    );

    if (!respuesta.ok) {
      return res.status(401).json({
        error: "Token inválido o expirado.",
      });
    }

    const user = await respuesta.json();

    req.authUser = user; // { id, email, ... }
    return next();
  } catch (error) {
    console.error("[Auth] Error verificando token:", error);

    return res.status(500).json({
      error: "No se pudo verificar la sesión.",
    });
  }
}

// Extrae el id del usuario autenticado (o null si no hay sesión).
export function getAuthUserId(req) {
  return req.authUser?.id ?? null;
}