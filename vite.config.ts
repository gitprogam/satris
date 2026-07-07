import { defineConfig } from "vite";

// server.host: true - 같은 와이파이의 다른 컴퓨터에서 개발 서버(LAN)로 접속할 수 있게 함
// (PvP 대전을 동아리 발표회 현장에서 로컬 네트워크로 테스트/시연하기 위함)
export default defineConfig({
  base: "/satris/",
  server: {
    host: true,
  },
});
