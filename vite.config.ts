import { defineConfig } from "vite";

// server.host: true - 같은 와이파이의 다른 컴퓨터에서 개발 서버(LAN)로 접속할 수 있게 함
// (PvP 대전을 동아리 발표회 현장에서 로컬 네트워크로 테스트/시연하기 위함)
export default defineConfig({
  base: "/satris/",
  server: {
    host: true,
  },
  // 클라우드플레어 터널(tetris.sada.ai.kr)이 원래 Host 헤더를 그대로 전달하는데,
  // vite preview는 기본적으로 DNS 리바인딩 방지로 알려지지 않은 Host를 막아버림.
  preview: {
    allowedHosts: ["tetris.sada.ai.kr"],
  },
});
