// 혼동되는 문자(0/O, 1/I/L) 제외한 방 코드용 문자셋
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(exists: (code: string) => boolean): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (exists(code));
  return code;
}
