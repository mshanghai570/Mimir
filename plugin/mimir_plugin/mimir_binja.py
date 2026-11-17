"""
Mimir: Binary Ninja & Frida Autonomous Reverse Engineering Plugin (v2.5)
Compatible with Binary Ninja 3.5+ on macOS (Apple Silicon / Intel), Linux, Windows.
"""

import base64
import json
import re
import threading
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
MIMIR_ICON_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAADgAAAA4CAAAAACN7WTCAAADz0lEQVR42tWVb2hVdRjHv8/vd+4d3hautT9uWEGOkJiVhdLcAgUFV66iCHFEL1YgQgjCgnwRpMuG0R8iogVBZCnhiKIXQytRIica1qYrW0txmNqma+U27z33/H7Ptxe3oezeOKd39cB5cQ7nc77f8zzP73mA/3OInTe0GbZwY/Hkz5XGJALT2MpDIrPgZ3wNqSRcCg/k/HAKBVJw1PtHkI7nAjSNOT0EM6vYq9FUK4I4zuLBKYZ86to/rmVeow3xbpfPMOT7Yq85eJWh92viuPmnmOdMvTGAiAhgTPlF5nmuNgZ8jpFq2AhbSI7Aom5SfcRXYsDD6tSxfzEE6VSQgsFtfXTqdDgGPEWv6jnTLu+cGR7+5SNpnaBT9bwYA+5Xp6pZvoHTJDmJrcxR1fH7OS/ObaY+EQAWxyWjXjW48TsEAIh9MYoLJ+g15B8VK+jJiI+nzzPvvV5tjKvHXs06ajv20ZFOv8WaLH1OD8QejWdJHm5BJz1JRtyJpV+Q3B7bqw+P9ywDupl1JOlyfDuFJa9feCYWzFSg6vnfeF1Mdt2CTLnEWUXFh9N86/5VmwboVc9uXrm8k/m+RbCxp+pl8jgAZMai0C8DgF3kV0Xg3DoS9R5nAGB9VZA2bWUAfqSvhhYpzLU6bX1zy1TLo6tHul3HC+t6v778mNgQwjirXcyTJPVzYJsnGdHxQJG14vl1AYaAy8v8ILjJ5BwDAuOxIDEKEdDa/B7nP/k9bYVCjMaW0WBRlko6noQpw25GJB3b46eV2AH1pEbhDqD9z4ikMmyAiR+P3cyT3pMvrieppNN+kQReF4f5yEfs6Zzmjm1ZOp9jR2zjALDoIcmNqYaqhprqlZ7kD/OMJNg5Ur3xzfNP4wjbGicvVbWc3bvpPiTaOgYVC1ILDpL+Kjl8l7l5YRKjhYoMDpC/PlFZ1TxADp5uLSVY7F3YNFS5RU/ur92S6f1ydVPmg/6lJ3ySvYrBn+4GsGSUHG8DUL5nphZJkoNvOHU7AKmuBoAbBjhRXwyWSpfVMt75cce9ly81tu9al6vzcUdqVvEIo/o2ks23Krkd5zhZl0wRgIQux7SV0OUgYMnWLK3KgEKlDSz4D0UrDv59yeyOZELQEqIQiAIQKEp1qinxZEwKmkIIBI5XrhTntVQzvRQGLPRQwYB0TZsEit4c2zBFgLAEYGF3vmd9kqx6++nQ2D2zlTNYNSI+WTnUjiClBECqwYjRpOXwAWYMAcKbHNKJGm72e6l36dfW5Xm0JsnUuC6zRnbzoVqeqMG/4gArZX0rKo7dkXBq/KfjLxgJDdluqtU6AAAAAElFTkSuQmCC"


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
            headers={"Content-Type": "application/json"},
            method="POST",
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
            self.bv.begin_undo_actions()
            self.bv.write(addr, patch_bytes)
            self.bv.set_comment_at(addr, f"[Mimir Patched] {orig_hex} -> {patch_hex} ({desc})")
            self.bv.commit_undo_actions()

        execute_on_main_thread(write_patch)
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

        class MimirSidebarWidget(SidebarWidget):
            def __init__(self, name, frame, data):
                super().__init__(name)
                self.frame = frame
                self.bv = data
                self.dialog = None
                self.settings_dialog = None
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
