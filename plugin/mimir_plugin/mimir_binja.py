"""
Mimir: Binary Ninja & Frida Autonomous Reverse Engineering Plugin (v2.5)
Compatible with Binary Ninja 3.5+ on macOS (Apple Silicon / Intel), Linux, Windows.
"""

import base64
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request

from binaryninja import (
    PluginCommand,
    Settings,
    execute_on_main_thread,
    log_error,
    log_info,
    log_warn,
)

DEFAULT_SERVER_ENDPOINT = "http://localhost:3000/api"
SETTINGS_KEY = "mimir.serverEndpoint"
PROVIDER_TYPE_KEY = "mimir.providerType"
PROVIDER_URL_KEY = "mimir.providerUrl"
MODEL_KEY = "mimir.model"
API_KEY_KEY = "mimir.apiKey"
MIMIR_ICON_PNG_BASE64 = "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"


def register_settings():
    settings = Settings()
    if not settings.contains(SETTINGS_KEY):
        settings.register_group("mimir", "Mimir AI Orchestrator")
        settings.register_setting(
            SETTINGS_KEY,
            json.dumps({
                "title": "Mimir Orchestrator API Endpoint",
                "type": "string",
                "default": DEFAULT_SERVER_ENDPOINT,
                "description": "Base URL for Mimir backend (e.g. http://localhost:3000/api)",
            }),
        )
    new_settings = {
        PROVIDER_TYPE_KEY: {"title": "AI Provider Type", "type": "string", "default": "gemini"},
        PROVIDER_URL_KEY: {"title": "AI Provider URL", "type": "string", "default": ""},
        MODEL_KEY: {"title": "AI Model", "type": "string", "default": "gemini-4-hydrogen"},
        API_KEY_KEY: {"title": "AI Provider API Key", "type": "string", "default": ""},
    }
    for key, definition in new_settings.items():
        if not settings.contains(key):
            settings.register_setting(key, json.dumps(definition))


def get_server_endpoint():
    try:
        val = Settings().get_string(SETTINGS_KEY)
        if val:
            return val.rstrip("/")
    except Exception:
        pass
    return DEFAULT_SERVER_ENDPOINT


def get_ai_config():
    settings = Settings()
    return {
        "providerType": settings.get_string(PROVIDER_TYPE_KEY) or "gemini",
        "providerUrl": settings.get_string(PROVIDER_URL_KEY) or "",
        "model": settings.get_string(MODEL_KEY) or "gemini-4-hydrogen",
        "apiKey": settings.get_string(API_KEY_KEY) or "",
    }


def safe_extract_hlil(func, max_chars=4500):
    try:
        if func.hlil is not None and func.hlil.root is not None:
            return "\n".join(str(line) for line in func.hlil.root.lines)[:max_chars]
    except Exception:
        pass
    try:
        if func.llil is not None:
            return "\n".join(str(line) for line in func.llil.instructions)[:max_chars]
    except Exception:
        pass
    return ""


def safe_extract_disasm(bv, func, max_lines=60):
    lines = []
    try:
        for block in func.basic_blocks:
            for tokens, addr in block:
                raw = bv.read(addr, min(4, bv.get_instruction_length(addr) or 4))
                hex_str = " ".join(f"{b:02X}" for b in raw)
                text = "".join(t.text for t in tokens)
                lines.append(f"{hex(addr)}: {hex_str:<12} {text}")
                if len(lines) >= max_lines:
                    return "\n".join(lines)
    except Exception:
        pass
    return "\n".join(lines)


def parse_patch_request(text):
    """Extract an explicit patch action and optional address without guessing."""
    lower = text.lower()
    patch_words = ("patch", "nop", "invert", "flip", "branch", "return true", "return false")
    is_patch = any(word in lower for word in patch_words)
    address_match = re.search(r"\b0x[0-9a-fA-F]+\b", text)
    address = int(address_match.group(0), 16) if address_match else None

    if re.search(r"\b(return|force).{0,12}\b(true|1)\b", lower):
        strategy = "force_return_true"
    elif re.search(r"\b(return|force).{0,12}\b(false|0)\b", lower):
        strategy = "force_return_false"
    elif re.search(r"\b(no[- ]?op|nop)\b", lower):
        strategy = "nop_sled"
    elif re.search(r"\b(invert|flip|reverse).{0,24}\b(branch|condition|conditional)\b", lower) or "invert branch" in lower:
        strategy = "invert_branch"
    else:
        strategy = None

    return {
        "is_patch": is_patch,
        "address": address,
        "strategy": strategy,
        "needs_clarification": is_patch and strategy is None,
    }


class MimirAgent:
    def __init__(self, bv):
        self.bv = bv

    def post_json(self, route, payload, timeout=45):
        endpoint = f"{get_server_endpoint()}{route}"
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {os.environ['MIMIR_ACCESS_TOKEN'].strip()}"}
                   if os.environ.get("MIMIR_ACCESS_TOKEN", "").strip() else {}),
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_json(self, route, timeout=45):
        endpoint = f"{get_server_endpoint()}{route}"
        req = urllib.request.Request(
            endpoint,
            headers={
                **({"Authorization": f"Bearer {os.environ['MIMIR_ACCESS_TOKEN'].strip()}"}
                   if os.environ.get("MIMIR_ACCESS_TOKEN", "").strip() else {}),
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def find_functions(self, query):
        cleaned = re.sub(
            r"\b(find|search|locate|show|list|where|is|are|the|related|functions?|routines?|methods?|please)\b",
            "",
            query.lower(),
        )
        terms = [t for t in re.split(r"\W+", cleaned) if len(t) >= 2]
        if not terms:
            terms = [query.lower().strip()]

        matches = []
        for func in self.bv.functions:
            corpus = f"{func.name} {func.symbol.full_name if func.symbol else ''}".lower()
            hlil_snippet = safe_extract_hlil(func, max_chars=1200).lower()
            combined = f"{corpus} {hlil_snippet}"
            score = sum(2 if t in corpus else (1 if t in combined else 0) for t in terms)
            if score > 0:
                matches.append((score, func))

        matches.sort(key=lambda item: (-item[0], item[1].start))
        return [m[1] for m in matches[:15]]

    def dispatch_role(self, role, objective, func=None, addr=None, on_done=None):
        target_func = func or (self.bv.get_functions_containing(addr)[0] if addr is not None else None)
        if target_func is None and len(self.bv.functions) > 0:
            target_func = self.bv.functions[0]

        payload = {
            "role": role,
            "agentConfig": get_ai_config(),
            "objective": objective,
            "context": {
                "binaryName": self.bv.file.filename,
                "arch": self.bv.arch.name if self.bv.arch else "arm64",
                "functionName": target_func.symbol.full_name if (target_func and target_func.symbol) else (target_func.name if target_func else "unknown"),
                "address": hex(addr if addr is not None else (target_func.start if target_func else 0)),
                "hlil": safe_extract_hlil(target_func) if target_func else "",
                "assembly": safe_extract_disasm(self.bv, target_func) if target_func else "",
            },
        }

        def worker():
            try:
                res = self.post_json("/ai/dispatch-role", payload)
                if res.get("success"):
                    output = res.get("output", "")
                    if target_func is not None:
                        def apply_comment():
                            self.bv.begin_undo_actions()
                            target_func.set_comment_at(target_func.start, f"[Mimir {role}] {output[:140].replace(chr(10), ' ')}")
                            self.bv.commit_undo_actions()
                        execute_on_main_thread(apply_comment)
                    if on_done:
                        on_done(True, output)
                else:
                    err_msg = res.get("error", "Unknown Mimir server error")
                    if on_done:
                        on_done(False, err_msg)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="ignore")
                if on_done:
                    on_done(False, f"HTTP {e.code}: {body[:240]}")
            except Exception as e:
                if on_done:
                    on_done(False, f"Connection error: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def analyze_function(self, func):
        log_info(f"[Mimir] Dispatching Decompiler Architect for {func.name} @ {hex(func.start)}")

        def handle_done(ok, msg):
            if ok:
                log_info(f"[Mimir Analysis - {func.name}]\n{msg}")
            else:
                log_error(f"[Mimir Analysis Failed]: {msg}")

        self.dispatch_role(
            "decompiler",
            f"Explain algorithm, parameters, and protection logic in {func.name}",
            func=func,
            addr=func.start,
            on_done=handle_done,
        )

    def synthesize_arm64_patch(self, addr, strategy="invert_branch"):
        arch_name = self.bv.arch.name if self.bv.arch else ""
        if "aarch64" not in arch_name and "arm64" not in arch_name:
            return False, f"Smart ARM64 patcher requires ARM64/AArch64 binary (detected: {arch_name})"

        try:
            instruction_len = self.bv.get_instruction_length(addr) or 0
            raw = bytearray(self.bv.read(addr, instruction_len) or b"")
        except Exception as exc:
            return False, f"Unable to read an ARM64 instruction at {hex(addr)}: {exc}; no bytes were written"
        if instruction_len != 4:
            return False, f"Address {hex(addr)} is not a readable 4-byte ARM64 instruction (length={instruction_len})"
        if len(raw) != 4:
            return False, f"Unable to read the complete ARM64 instruction at {hex(addr)}; no bytes were written"

        orig_hex = " ".join(f"{b:02X}" for b in raw)

        if strategy == "force_return_true":
            patch_bytes = bytes([0x20, 0x00, 0x80, 0xD2, 0xC0, 0x03, 0x5F, 0xD6])
            desc = "MOV X0, #1; RET"
        elif strategy == "force_return_false":
            patch_bytes = bytes([0x00, 0x00, 0x80, 0xD2, 0xC0, 0x03, 0x5F, 0xD6])
            desc = "MOV X0, #0; RET"
        elif strategy == "nop_sled":
            patch_bytes = bytes([0x1F, 0x20, 0x03, 0xD5])
            desc = "NOP"
        else:
            # Invert ARM64 B.cond (bit 0 of byte 0) or CBZ/CBNZ/TBZ/TBNZ (bit 0 of byte 3)
            disasm_text = (self.bv.get_disassembly(addr) or "").upper()
            if disasm_text.startswith("B.") and (raw[3] & 0xFE) == 0x54:
                raw[0] ^= 0x01
                patch_bytes = bytes(raw)
                desc = f"Inverted {disasm_text}"
            elif (disasm_text.startswith("CBZ") or disasm_text.startswith("CBNZ") or disasm_text.startswith("TBZ") or disasm_text.startswith("TBNZ")):
                raw[3] ^= 0x01
                patch_bytes = bytes(raw)
                desc = f"Inverted {disasm_text}"
            else:
                return False, f"{hex(addr)} is not a conditional branch; choose NOP or a return patch explicitly"

        if len(patch_bytes) > 4:
            try:
                second_len = self.bv.get_instruction_length(addr + 4) or 0
                available = self.bv.read(addr, len(patch_bytes)) or b""
            except Exception as exc:
                return False, f"Unable to validate the complete {len(patch_bytes)}-byte patch at {hex(addr)}: {exc}; no bytes were written"
            if second_len != 4 or len(available) != len(patch_bytes):
                return False, f"Patch needs {len(patch_bytes)} bytes at {hex(addr)}, but the complete patch range is not readable; no bytes were written"

        patch_hex = " ".join(f"{b:02X}" for b in patch_bytes)

        def write_patch():
            undo_open = False
            try:
                self.bv.begin_undo_actions()
                undo_open = True
                self.bv.write(addr, patch_bytes)
                self.bv.set_comment_at(addr, f"[Mimir Patched] {orig_hex} -> {patch_hex} ({desc})")
                self.bv.commit_undo_actions()
                undo_open = False
            except Exception:
                abort_undo = getattr(self.bv, "abort_undo_actions", None)
                if undo_open and abort_undo is not None:
                    abort_undo()
                raise

        try:
            execute_on_main_thread(write_patch)
        except Exception as exc:
            return False, f"Patch failed at {hex(addr)}: {exc}; no successful patch was reported"
        return True, f"Patched {hex(addr)}: {orig_hex} -> {patch_hex} ({desc})"

    def generate_patch(self, func, addr=None, strategy="invert_branch"):
        if func is None and addr is None:
            return False, "Select a function or provide an address before patching"
        target_addr = addr if addr is not None else func.start
        if addr is None:
            for block in func.basic_blocks:
                for tokens, inst_addr in block:
                    text = "".join(t.text for t in tokens).upper()
                    if any(op in text for op in ("B.", "CBZ", "CBNZ", "TBZ", "TBNZ")):
                        target_addr = inst_addr
                        break

        ok, summary = self.synthesize_arm64_patch(target_addr, strategy=strategy)
        if ok:
            log_info(f"[Mimir Patcher] {summary}")
        else:
            log_warn(f"[Mimir Patcher] {summary}")
        return ok, summary


def register_mimir():
    register_settings()

    def cmd_analyze(bv, func):
        MimirAgent(bv).analyze_function(func)

    def cmd_patch_addr(bv, addr):
        funcs = bv.get_functions_containing(addr)
        agent = MimirAgent(bv)
        if funcs:
            agent.generate_patch(funcs[0], addr=addr, strategy="invert_branch")
        else:
            agent.synthesize_arm64_patch(addr, strategy="invert_branch")

    def cmd_patch_func_true(bv, func):
        MimirAgent(bv).generate_patch(func, addr=func.start, strategy="force_return_true")

    PluginCommand.register_for_function(
        "Mimir\\1. Analyze Function with AI",
        "Dispatches configured Mimir AI role to analyze HLIL & assembly",
        cmd_analyze,
    )
    PluginCommand.register_for_function(
        "Mimir\\2. Patch Function to Return True (ARM64)",
        "Writes MOV X0, #1; RET at function entry with undo support",
        cmd_patch_func_true,
    )
    PluginCommand.register_for_address(
        "Mimir\\3. Smart Invert Branch / NOP at Address",
        "Inverts conditional ARM64 branch or inserts NOP at selected address",
        cmd_patch_addr,
    )

    try:
        from binaryninjaui import Sidebar, SidebarWidget, SidebarWidgetType
        from PySide6.QtCore import QObject, Signal
        from PySide6.QtGui import QImage
        from PySide6.QtWidgets import (
            QComboBox,
            QDialog,
            QFormLayout,
            QHBoxLayout,
            QLabel,
            QLineEdit,
            QPushButton,
            QTextEdit,
            QVBoxLayout,
        )

        class _SignalBridge(QObject):
            message_ready = Signal(str, str)

        class MimirFloatingDialog(QDialog):
            def __init__(self, bv, current_func=None, parent=None):
                super().__init__(parent)
                self.bv = bv
                self.current_func = current_func
                self.agent = MimirAgent(bv) if bv else None
                self.bridge = _SignalBridge()
                self.bridge.message_ready.connect(self._append_message)

                self.setWindowTitle("Mimir AI Agent - Floating Pop-up")
                self.resize(520, 640)
                layout = QVBoxLayout(self)

                self.status_label = QLabel(
                    f"Target: {bv.file.filename if bv else 'No binary loaded'}", self
                )
                layout.addWidget(self.status_label)

                self.history = QTextEdit(self)
                self.history.setReadOnly(True)
                self.history.append("<b>Mimir AI Assistant</b> ready. Talk in plain English:")
                self.history.append("• <i>'find purchase related functions'</i>")
                self.history.append("• <i>'patch this function to return true'</i>")
                self.history.append("• <i>'explain this function'</i>")
                layout.addWidget(self.history)

                quick_row = QHBoxLayout()
                btn_find = QPushButton("Find Purchase", self)
                btn_patch = QPushButton("Smart Patch", self)
                btn_analyze = QPushButton("Analyze Current", self)
                btn_find.clicked.connect(lambda: self._run_query("find purchase related functions"))
                btn_patch.clicked.connect(lambda: self._run_query("I want to patch the current function"))
                btn_analyze.clicked.connect(lambda: self._run_query("explain algorithm and security checks"))
                quick_row.addWidget(btn_find)
                quick_row.addWidget(btn_patch)
                quick_row.addWidget(btn_analyze)
                layout.addLayout(quick_row)

                input_row = QHBoxLayout()
                self.input_box = QLineEdit(self)
                self.input_box.setPlaceholderText("Ask Mimir in plain language...")
                self.input_box.returnPressed.connect(self._on_submit)
                self.btn = QPushButton("Act", self)
                self.btn.clicked.connect(self._on_submit)
                input_row.addWidget(self.input_box)
                input_row.addWidget(self.btn)
                layout.addLayout(input_row)

            def set_context(self, bv, func=None):
                self.bv = bv
                self.current_func = func
                self.agent = MimirAgent(bv) if bv else None
                if bv:
                    fname = func.name if func else "None"
                    self.status_label.setText(f"Target: {bv.file.filename} · Function: {fname}")

            def prompt_for_patch(self):
                self.history.append("<p><b>Mimir Patcher:</b><br/>Describe the patch in plain language. For example: <i>invert the branch at 0x100003FA0</i>, <i>write a NOP at 0x100003FA0</i>, or <i>make this function return false</i>.</p>")
                self.input_box.setPlaceholderText("Describe the patch and optional address...")
                self.input_box.setFocus()

            def _append_message(self, sender, text):
                safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                self.history.append(f"<p><b>{sender}:</b><br/>{safe}</p>")
                self.btn.setEnabled(True)

            def _on_submit(self):
                query = self.input_box.text().strip()
                if not query:
                    return
                self.input_box.clear()
                self._run_query(query)

            def _run_query(self, query):
                self._append_message("You", query)
                if not self.agent or not self.bv:
                    self._append_message("System", "No active BinaryView open in Binary Ninja.")
                    return

                lower = query.lower()
                if any(k in lower for k in ("find", "search", "locate")) and "function" in lower:
                    matches = self.agent.find_functions(query)
                    if matches:
                        top = matches[0]
                        execute_on_main_thread(lambda: self.bv.navigate(self.bv.view, top.start))
                        self.current_func = top
                        summary = "\n".join(f"• {m.name} @ {hex(m.start)}" for m in matches[:8])
                        self._append_message("Mimir Search", f"Navigated to {top.name} ({hex(top.start)}):\n{summary}")
                    else:
                        self._append_message("Mimir Search", "No matching functions found in current BinaryView.")
                    return

                patch_intent = parse_patch_request(query)
                if patch_intent["is_patch"]:
                    if patch_intent["needs_clarification"]:
                        self._append_message("Mimir Patcher", "Tell me exactly what to do: invert the conditional branch, write a NOP, return true, or return false. You can include an address such as 0x100003FA0.")
                        return
                    func = self.current_func or (self.bv.functions[0] if len(self.bv.functions) > 0 else None)
                    ok, msg = self.agent.generate_patch(func, addr=patch_intent["address"], strategy=patch_intent["strategy"])
                    self._append_message("Mimir Patcher" if ok else "Patch Error", msg)
                    return

                self.btn.setEnabled(False)
                self.history.append("<i>Dispatching to Mimir AI backend...</i>")
                role = "frida_tracer" if ("frida" in lower or "hook" in lower) else ("auditor" if "audit" in lower else "decompiler")

                def on_done(ok, output):
                    self.bridge.message_ready.emit("Mimir AI" if ok else "Mimir Error", output)

                self.agent.dispatch_role(role, query, func=self.current_func, on_done=on_done)

        class MimirSettingsDialog(QDialog):
            def __init__(self, parent=None):
                super().__init__(parent)
                self.setWindowTitle("Mimir AI Provider Settings")
                self.resize(520, 300)
                settings = Settings()
                form = QFormLayout(self)

                self.provider_type = QComboBox(self)
                self.provider_type.addItem("Google Gemini", "gemini")
                self.provider_type.addItem("OpenAI-compatible", "openai-compatible")
                current_type = settings.get_string(PROVIDER_TYPE_KEY) or "gemini"
                index = self.provider_type.findData(current_type)
                self.provider_type.setCurrentIndex(index if index >= 0 else 0)
                form.addRow("Provider", self.provider_type)

                self.provider_url = QLineEdit(settings.get_string(PROVIDER_URL_KEY) or "", self)
                self.provider_url.setPlaceholderText("https://api.openai.com or http://localhost:11434")
                form.addRow("Provider URL", self.provider_url)

                self.model = QLineEdit(settings.get_string(MODEL_KEY) or "gemini-4-hydrogen", self)
                form.addRow("Model", self.model)

                self.api_key = QLineEdit(settings.get_string(API_KEY_KEY) or "", self)
                self.api_key.setEchoMode(QLineEdit.Password)
                self.api_key.setPlaceholderText("Stored in Binary Ninja settings")
                form.addRow("API key", self.api_key)

                self.endpoint = QLineEdit(settings.get_string(SETTINGS_KEY) or DEFAULT_SERVER_ENDPOINT, self)
                form.addRow("Mimir backend", self.endpoint)

                note = QLabel("Gemini uses GEMINI_API_KEY on the backend. OpenAI-compatible providers use the URL and key above.", self)
                note.setWordWrap(True)
                form.addRow("", note)

                buttons = QHBoxLayout()
                save = QPushButton("Save", self)
                cancel = QPushButton("Cancel", self)
                save.clicked.connect(self.save)
                cancel.clicked.connect(self.reject)
                buttons.addWidget(save)
                buttons.addWidget(cancel)
                form.addRow("", buttons)

            def save(self):
                settings = Settings()
                settings.set_string(PROVIDER_TYPE_KEY, self.provider_type.currentData())
                settings.set_string(PROVIDER_URL_KEY, self.provider_url.text().strip())
                settings.set_string(MODEL_KEY, self.model.text().strip())
                settings.set_string(API_KEY_KEY, self.api_key.text())
                settings.set_string(SETTINGS_KEY, self.endpoint.text().strip().rstrip("/"))
                self.accept()

        class MimirMultiAgentDialog(QDialog):
            def __init__(self, bv, current_func=None, parent=None):
                super().__init__(parent)
                self.bv = bv
                self.current_func = current_func
                self.agent = MimirAgent(bv) if bv else None
                self.setWindowTitle("Mimir Multi-Agent Team")
                self.resize(620, 620)
                layout = QVBoxLayout(self)
                layout.addWidget(QLabel("Dispatch several models/providers against the same Binary Ninja context.", self))

                self.objective = QTextEdit(self)
                self.objective.setPlainText("Analyze the current function, explain its security checks, and propose safe next steps.")
                self.objective.setMaximumHeight(90)
                layout.addWidget(self.objective)

                form = QFormLayout()
                self.agent_rows = []
                for title, role in (("Decompiler", "decompiler"), ("Security Auditor", "auditor"), ("Frida Specialist", "frida_tracer")):
                    model = QLineEdit(get_ai_config().get("model", ""), self)
                    model.setPlaceholderText("Model ID; each row may use a different model")
                    form.addRow(f"{title} model", model)
                    self.agent_rows.append((role, model))
                layout.addLayout(form)

                self.output = QTextEdit(self)
                self.output.setReadOnly(True)
                layout.addWidget(self.output)
                run = QPushButton("Dispatch Team", self)
                run.clicked.connect(self.dispatch)
                layout.addWidget(run)

            def dispatch(self):
                if not self.agent or not self.bv:
                    self.output.append("No active BinaryView open in Binary Ninja.")
                    return
                func = self.current_func or (self.bv.functions[0] if len(self.bv.functions) > 0 else None)
                config = get_ai_config()
                context = {
                    "binaryName": self.bv.file.filename,
                    "arch": self.bv.arch.name if self.bv.arch else "arm64",
                    "functionName": func.name if func else "unknown",
                    "address": hex(func.start) if func else "0x0",
                    "hlil": safe_extract_hlil(func) if func else "",
                    "assembly": safe_extract_disasm(self.bv, func) if func else "",
                }
                agents = []
                for role, model in self.agent_rows:
                    agents.append({
                        "id": role,
                        "role": role,
                        "providerType": config.get("providerType"),
                        "providerUrl": config.get("providerUrl"),
                        "apiKey": config.get("apiKey"),
                        "model": model.text().strip() or config.get("model"),
                    })
                payload = {"objective": self.objective.toPlainText().strip(), "context": context, "agents": agents}
                self.output.append("<b>Team:</b> queued server-owned job...")

                def worker():
                    try:
                        result = self.agent.post_json("/ai/jobs", payload)
                        job = result.get("job") or {}
                        job_id = job.get("id")
                        if not job_id:
                            raise RuntimeError(result.get("error", "Job was not created"))
                        seen = set()
                        for _ in range(150):
                            time.sleep(0.4)
                            status = self.agent.get_json(f"/ai/jobs/{job_id}").get("job", {})
                            for event in status.get("events", []):
                                key = (event.get("agentId"), event.get("status"), event.get("text"), event.get("error"))
                                if key in seen or event.get("status") not in ("completed", "error"):
                                    continue
                                seen.add(key)
                                label = event.get("role", "agent")
                                text = event.get("text") or event.get("error") or "No output"
                                execute_on_main_thread(lambda label=label, text=text: self.output.append(f"<b>{label}:</b><br/>{text}"))
                            if status.get("status") != "running":
                                break
                    except Exception as exc:
                        message = str(exc)
                        execute_on_main_thread(lambda message=message: self.output.append(f"<b>Multi-agent error:</b> {message}"))

                threading.Thread(target=worker, daemon=True).start()

        class MimirFridaDialog(QDialog):
            def __init__(self, bv, current_func=None, parent=None):
                super().__init__(parent)
                self.bv = bv
                self.current_func = current_func
                self.agent = MimirAgent(bv) if bv else None
                self.setWindowTitle("Mimir Frida Bridge")
                self.resize(620, 600)
                layout = QVBoxLayout(self)
                layout.addWidget(QLabel("Real mode requires MIMIR_FRIDA_MODE=real and Frida installed on the Mac host. Otherwise the server reports simulation mode.", self))
                self.device_id = QLineEdit(self)
                self.device_id.setPlaceholderText("Device ID from List Devices")
                layout.addWidget(self.device_id)
                self.pid = QLineEdit(self)
                self.pid.setPlaceholderText("Process PID")
                layout.addWidget(self.pid)
                self.script = QTextEdit(self)
                self.script.setPlainText("console.log('Mimir Frida script loaded');")
                layout.addWidget(self.script)
                self.output = QTextEdit(self)
                self.output.setReadOnly(True)
                layout.addWidget(self.output)
                buttons = QHBoxLayout()
                for label, callback in (("List Devices", self.list_devices), ("List Processes", self.list_processes), ("Run Script", self.run_script)):
                    button = QPushButton(label, self)
                    button.clicked.connect(callback)
                    buttons.addWidget(button)
                layout.addLayout(buttons)

            def show_result(self, result):
                mode = result.get("mode", "unknown")
                self.output.append(f"<b>Mode:</b> {mode}<br/>{json.dumps(result, indent=2)}")

            def list_devices(self):
                def worker():
                    try:
                        result = self.agent.get_json("/frida/devices")
                        execute_on_main_thread(lambda: self.show_result(result))
                    except Exception as exc:
                        message = str(exc)
                        execute_on_main_thread(lambda message=message: self.output.append(f"Frida error: {message}"))
                threading.Thread(target=worker, daemon=True).start()

            def list_processes(self):
                def worker():
                    try:
                        result = self.agent.post_json("/frida/processes", {"deviceId": self.device_id.text().strip()})
                        execute_on_main_thread(lambda: self.show_result(result))
                    except Exception as exc:
                        message = str(exc)
                        execute_on_main_thread(lambda message=message: self.output.append(f"Frida error: {message}"))
                threading.Thread(target=worker, daemon=True).start()

            def run_script(self):
                def worker():
                    try:
                        result = self.agent.post_json("/frida/run-script", {
                            "deviceId": self.device_id.text().strip(),
                            "pid": int(self.pid.text().strip()),
                            "script": self.script.toPlainText(),
                            "scriptType": "custom",
                        })
                        execute_on_main_thread(lambda: self.show_result(result))
                    except Exception as exc:
                        message = str(exc)
                        execute_on_main_thread(lambda message=message: self.output.append(f"Frida error: {message}"))
                threading.Thread(target=worker, daemon=True).start()

        class MimirSidebarWidget(SidebarWidget):
            def __init__(self, name, frame, data):
                super().__init__(name)
                self.frame = frame
                self.bv = data
                self.dialog = None
                self.settings_dialog = None
                self.multi_agent_dialog = None
                self.frida_dialog = None
                layout = QVBoxLayout(self)
                self.info_label = QLabel("Mimir AI Assistant", self)
                layout.addWidget(self.info_label)

                btn_popup = QPushButton("Open Mimir Floating Chat", self)
                btn_popup.clicked.connect(self.show_floating_popup)
                layout.addWidget(btn_popup)

                btn_analyze = QPushButton("Analyze Current Function", self)
                btn_analyze.clicked.connect(self.analyze_current)
                layout.addWidget(btn_analyze)

                btn_patch = QPushButton("Smart Invert Branch / Patch", self)
                btn_patch.clicked.connect(self.patch_current)
                layout.addWidget(btn_patch)

                btn_settings = QPushButton("AI Provider Settings", self)
                btn_settings.clicked.connect(self.show_settings)
                layout.addWidget(btn_settings)

                btn_agents = QPushButton("Multi-Agent Team", self)
                btn_agents.setToolTip("Dispatch multiple models/providers through the Mimir backend")
                btn_agents.clicked.connect(self.show_multi_agents)
                layout.addWidget(btn_agents)

                btn_frida = QPushButton("Frida Bridge", self)
                btn_frida.setToolTip("List devices, inspect processes, and run Frida scripts")
                btn_frida.clicked.connect(self.show_frida)
                layout.addWidget(btn_frida)
                layout.addStretch(1)

            def notifyViewChanged(self, view_frame):
                self.frame = view_frame
                if view_frame is not None:
                    view = view_frame.getCurrentViewInterface()
                    if view is not None:
                        self.bv = view.getData()
                        if self.dialog is not None:
                            self.dialog.set_context(self.bv, self._get_current_func())

            def _get_current_func(self):
                if self.frame is not None:
                    view = self.frame.getCurrentViewInterface()
                    if view is not None:
                        func = view.getCurrentFunction()
                        if func is not None:
                            return func
                if self.bv and len(self.bv.functions) > 0:
                    return self.bv.functions[0]
                return None

            def analyze_current(self):
                func = self._get_current_func()
                if self.bv and func:
                    MimirAgent(self.bv).analyze_function(func)

            def patch_current(self):
                self.show_floating_popup(patch_prompt=True)

            def show_floating_popup(self, patch_prompt=False):
                func = self._get_current_func()
                if self.dialog is None:
                    self.dialog = MimirFloatingDialog(self.bv, current_func=func, parent=self)
                else:
                    self.dialog.set_context(self.bv, func)
                self.dialog.show()
                self.dialog.raise_()
                if patch_prompt:
                    self.dialog.prompt_for_patch()

            def show_settings(self):
                if self.settings_dialog is None:
                    self.settings_dialog = MimirSettingsDialog(self)
                self.settings_dialog.show()
                self.settings_dialog.raise_()
                self.settings_dialog.activateWindow()

            def show_multi_agents(self):
                if self.multi_agent_dialog is None:
                    self.multi_agent_dialog = MimirMultiAgentDialog(self.bv, self._get_current_func(), self)
                else:
                    self.multi_agent_dialog.bv = self.bv
                    self.multi_agent_dialog.current_func = self._get_current_func()
                self.multi_agent_dialog.show()
                self.multi_agent_dialog.raise_()
                self.multi_agent_dialog.activateWindow()

            def show_frida(self):
                if self.frida_dialog is None:
                    self.frida_dialog = MimirFridaDialog(self.bv, self._get_current_func(), self)
                else:
                    self.frida_dialog.bv = self.bv
                    self.frida_dialog.current_func = self._get_current_func()
                self.frida_dialog.show()
                self.frida_dialog.raise_()
                self.frida_dialog.activateWindow()

        def make_sidebar_icon():
            icon = QImage()
            icon.loadFromData(base64.b64decode(MIMIR_ICON_PNG_BASE64), "PNG")
            return icon

        class MimirSidebarWidgetType(SidebarWidgetType):
            def __init__(self):
                SidebarWidgetType.__init__(self, make_sidebar_icon(), "Mimir AI")

            def createWidget(self, frame, data):
                return MimirSidebarWidget("Mimir AI", frame, data)

        Sidebar.addSidebarWidgetType(MimirSidebarWidgetType())
    except Exception as e:
        log_error(f"[Mimir] UI Sidebar/Dialog registration failed: {e}")
