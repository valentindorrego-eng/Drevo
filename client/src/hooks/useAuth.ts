import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  email: string;
  googleId: string | null;
  displayName: string | null;
  preferredSize: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyType: string | null;
  profileImageUrl: string | null;
  fullBodyImageUrl: string | null;
  createdAt: string | null;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; displayName?: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: {
      displayName?: string;
      preferredSize?: string;
      heightCm?: number | null;
      weightKg?: number | null;
      bodyType?: string;
    }) => {
      const res = await apiRequest("PUT", "/api/auth/profile", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const uploadFullBodyMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("fullbody", file);
      const res = await fetch("/api/auth/fullbody", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation,
    register: registerMutation,
    logout: logoutMutation,
    updateProfile: updateProfileMutation,
    uploadAvatar: uploadAvatarMutation,
    uploadFullBody: uploadFullBodyMutation,
  };
}
