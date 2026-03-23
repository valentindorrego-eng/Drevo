import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      passwordHash: string | null;
      googleId: string | null;
      displayName: string | null;
      preferredSize: string | null;
      heightCm: number | null;
      weightKg: number | null;
      bodyType: string | null;
      profileImageUrl: string | null;
      createdAt: Date | null;
    }
  }
}

passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user || undefined);
  } catch (err) {
    done(err);
  }
});

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: "Email o contraseña incorrectos" });
        }
        if (!user.passwordHash) {
          return done(null, false, { message: "Esta cuenta usa Google. Iniciá sesión con Google." });
        }
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: "Email o contraseña incorrectos" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback";
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(null, false, { message: "No se pudo obtener el email de Google" });
          }

          let user = await storage.getUserByGoogleId(googleId);
          if (user) {
            return done(null, user);
          }

          user = await storage.getUserByEmail(email);
          if (user) {
            const updated = await storage.updateUser(user.id, {
              googleId,
              displayName: user.displayName || profile.displayName,
              profileImageUrl: user.profileImageUrl || profile.photos?.[0]?.value,
            });
            return done(null, updated || user);
          }

          user = await storage.createUser({
            email,
            googleId,
            displayName: profile.displayName,
            profileImageUrl: profile.photos?.[0]?.value,
          });
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

export { passport };
