import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey);
const $ = (s) => document.querySelector(s);

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function initials(name = "Usuário") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.map(p => p[0]).join("").slice(0, 2) || "U").toUpperCase();
}

function initialsAvatar(name) {
  const text = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#eeeeff"/><text x="48" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#4d51ce">${text}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function ensureNameField() {
  if ($("#displayNameInput")) return;
  const discordField = $("#discordUserId")?.closest(".field");
  if (!discordField) return;
  const field = document.createElement("div");
  field.className = "field";
  field.innerHTML = `<label>Nome exibido</label><input id="displayNameInput" maxlength="60" autocomplete="name" placeholder="Ex.: Lucas Nery" /><div class="hint">É o nome que aparece no Hub para sua equipe.</div>`;
  discordField.before(field);

  const discord = $("#discordUserId");
  if (discord) {
    discord.setAttribute("inputmode", "numeric");
    discord.setAttribute("pattern", "[0-9]{15,22}");
    discord.setAttribute("title", "Use o Discord User ID numérico, não o nome de usuário.");
    const hint = discord.parentElement?.querySelector(".hint");
    if (hint) hint.textContent = "Cole seu Discord User ID numérico (ex.: 123456789012345678), não o @ ou nome de usuário.";
  }
}

async function isBrave() {
  try { return !!(navigator.brave && await navigator.brave.isBrave()); }
  catch { return false; }
}

async function ensureBraveHint() {
  if (!(await isBrave())) return;
  const block = $(".settings-block");
  if (!block || $("#bravePushHint")) return;
  const hint = document.createElement("div");
  hint.id = "bravePushHint";
  hint.style.cssText = "margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff7e8;border:1px solid #f0dfbd;font-size:11px;line-height:1.45;color:#6d4b0d";
  hint.innerHTML = `<strong>Brave:</strong> se aparecer “Registration failed - push service error”, abra <b>Configurações → Privacidade e segurança</b> e ative <b>Usar serviços do Google para mensagens push</b>. Depois recarregue o Hub.`;
  block.insertAdjacentElement("afterend", hint);
}

async function refreshProfileUI() {
  ensureNameField();
  await ensureBraveHint();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  if (!profile) return;

  const googleAvatar = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || "";
  if (googleAvatar && !profile.avatar_url) {
    supabase.from("profiles").update({ avatar_url: googleAvatar }).eq("id", session.user.id).then(() => {});
  }

  const displayName = profile.display_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Usuário";
  const nameInput = $("#displayNameInput");
  if (nameInput) nameInput.value = displayName;
  if ($("#accountName")) $("#accountName").textContent = displayName;
  if ($("#accountInitials")) $("#accountInitials").textContent = initials(displayName);

  const avatar = profile.avatar_url || googleAvatar;
  const modalImg = $("#accountLargeAvatar");
  if (modalImg) {
    modalImg.onerror = () => { modalImg.onerror = null; modalImg.src = initialsAvatar(displayName); };
    modalImg.src = avatar || initialsAvatar(displayName);
  }

  const headerImg = $("#accountAvatar");
  const headerBtn = $("#accountBtn");
  if (headerImg && headerBtn && avatar) {
    headerImg.onerror = () => headerBtn.classList.remove("has-photo");
    headerImg.src = avatar;
    headerBtn.classList.add("has-photo");
  }
}

document.addEventListener("submit", async (event) => {
  if (event.target?.id !== "accountForm") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const displayName = $("#displayNameInput")?.value.trim() || "";
  const discordId = $("#discordUserId")?.value.trim() || "";
  if (!displayName) { alert("Digite um nome para aparecer no Hub."); return; }
  if (discordId && !/^\d{15,22}$/.test(discordId)) {
    alert("O Discord User ID precisa ser numérico. Não use seu @ ou nome de usuário. No Discord, ative o Modo Desenvolvedor, clique com o botão direito no seu perfil e escolha ‘Copiar ID do usuário’. ");
    return;
  }

  const { error } = await supabase.from("profiles").update({ display_name: displayName, discord_user_id: discordId }).eq("id", session.user.id);
  if (error) { alert(`Não foi possível salvar sua conta: ${error.message}`); return; }

  if ($("#accountName")) $("#accountName").textContent = displayName;
  if ($("#accountInitials")) $("#accountInitials").textContent = initials(displayName);
  $("#accountDialog")?.close();
  toast("Conta atualizada.");
}, true);

const observer = new MutationObserver(() => { if ($("#accountDialog")?.open) refreshProfileUI(); });

function start() {
  ensureNameField();
  ensureBraveHint();
  const dialog = $("#accountDialog");
  if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  $("#accountBtn")?.addEventListener("click", () => setTimeout(refreshProfileUI, 0));
  refreshProfileUI();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
