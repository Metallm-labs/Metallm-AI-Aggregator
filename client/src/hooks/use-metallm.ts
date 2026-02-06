import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertQuery, QueryWithResponses } from "@shared/routes";

// GET /api/metallm/queries
export function useQueries() {
  return useQuery({
    queryKey: [api.metallm.list.path],
    queryFn: async () => {
      const res = await fetch(api.metallm.list.path, { credentials: "include" });
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok) throw new Error("Failed to fetch queries");
      return api.metallm.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/metallm/queries/:id
export function useQueryDetail(id: number | null) {
  return useQuery({
    queryKey: [api.metallm.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.metallm.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch query details");
      return api.metallm.get.responses[200].parse(await res.json());
    },
  });
}

// POST /api/metallm/process
export function useSubmitQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertQuery) => {
      // Validate input before sending using the schema from routes
      const validated = api.metallm.submit.input.parse(data);
      
      const res = await fetch(api.metallm.submit.path, {
        method: api.metallm.submit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.metallm.submit.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        if (res.status === 401) {
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to process query");
      }
      return api.metallm.submit.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.metallm.list.path] });
      // Pre-populate the cache for the individual query view
      queryClient.setQueryData([api.metallm.get.path, data.id], data);
    },
  });
}
