type SessionReader = { auth: { getSession(): PromiseLike<{ data: { session: { user: { email?: string | null } } | null } }> } };

/** The signed-in user's email, read from the locally stored session (works while offline). */
export async function currentOwner(db: SessionReader): Promise<string | null> {
  try {
    const { data } = await db.auth.getSession();
    return data.session?.user.email ?? null;
  } catch {
    return null;
  }
}
