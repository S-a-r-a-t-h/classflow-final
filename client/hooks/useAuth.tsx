import React, { createContext, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";
import api from "../utils/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = Cookies.get("token");
    const u = Cookies.get("user");
    if (t && u) {
      setToken(t);
      try { setUser(JSON.parse(u)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/api/auth/login", { email, password });
    const { access_token, user: u } = res.data;
    Cookies.set("token", access_token, { expires: 1 });
    Cookies.set("user", JSON.stringify(u), { expires: 1 });
    setToken(access_token);
    setUser(u);
  };

  const register = async (name: string, email: string, password: string, role: string) => {
    const res = await api.post("/api/auth/register", { name, email, password, role });
    const { access_token, user: u } = res.data;
    Cookies.set("token", access_token, { expires: 1 });
    Cookies.set("user", JSON.stringify(u), { expires: 1 });
    setToken(access_token);
    setUser(u);
  };

  const logout = () => {
    Cookies.remove("token");
    Cookies.remove("user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
