import importlib
import sys
import types
import unittest


class PluginLogicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        binaryninja = types.ModuleType("binaryninja")

        class PluginCommand:
            @staticmethod
            def register_for_function(*args):
                pass

            @staticmethod
            def register_for_address(*args):
                pass

        class Settings:
            def contains(self, key):
                return False

            def register_group(self, *args):
                pass

            def register_setting(self, *args):
                pass

            def get_string(self, key):
                return ""

            def set_string(self, key, value):
                pass

        binaryninja.PluginCommand = PluginCommand
        binaryninja.Settings = Settings
        binaryninja.execute_on_main_thread = lambda fn: fn()
        binaryninja.log_error = binaryninja.log_info = binaryninja.log_warn = lambda *args: None
        sys.modules["binaryninja"] = binaryninja
        cls.plugin = importlib.import_module("plugin.mimir_plugin.mimir_binja")

    def test_patch_intent_extracts_explicit_return_and_address(self):
        result = self.plugin.parse_patch_request("patch 0x100003FA0 to return false")
        self.assertEqual(result["address"], 0x100003FA0)
        self.assertEqual(result["strategy"], "force_return_false")
        self.assertFalse(result["needs_clarification"])

    def test_patch_intent_requests_clarification_when_strategy_is_missing(self):
        result = self.plugin.parse_patch_request("I want to patch this function")
        self.assertTrue(result["is_patch"])
        self.assertTrue(result["needs_clarification"])
        self.assertIsNone(result["strategy"])

    def test_unmapped_address_writes_nothing(self):
        bv = FakeBinaryView({})
        ok, message = self.plugin.MimirAgent(bv).synthesize_arm64_patch(0x1000, "nop_sled")
        self.assertFalse(ok)
        self.assertIn("no bytes were written", message)
        self.assertEqual(bv.writes, [])

    def test_non_branch_inversion_does_not_fallback_to_nop(self):
        bv = FakeBinaryView({0x1000: 4}, disassembly="ADD X0, X0, X1")
        ok, message = self.plugin.MimirAgent(bv).synthesize_arm64_patch(0x1000, "invert_branch")
        self.assertFalse(ok)
        self.assertIn("not a conditional branch", message)
        self.assertEqual(bv.writes, [])

    def test_return_patch_validates_and_writes_two_instructions(self):
        bv = FakeBinaryView({0x1000: 4, 0x1004: 4})
        ok, message = self.plugin.MimirAgent(bv).synthesize_arm64_patch(0x1000, "force_return_true")
        self.assertTrue(ok)
        self.assertIn("MOV X0, #1; RET", message)
        self.assertEqual(len(bv.writes), 1)
        self.assertEqual(len(bv.writes[0][1]), 8)


class Architecture:
    name = "aarch64"


class FakeBinaryView:
    arch = Architecture()

    def __init__(self, instruction_lengths, disassembly="ADD X0, X0, X1"):
        self.instruction_lengths = instruction_lengths
        self.disassembly = disassembly
        self.writes = []

    def get_instruction_length(self, address):
        if address not in self.instruction_lengths:
            raise ValueError("unmapped address")
        return self.instruction_lengths[address]

    def read(self, address, size):
        if address == 0x1000 and size <= 16:
            return b"\x00" * size
        return b""

    def get_disassembly(self, address):
        return self.disassembly

    def begin_undo_actions(self):
        pass

    def commit_undo_actions(self):
        pass

    def write(self, address, data):
        self.writes.append((address, data))

    def set_comment_at(self, address, text):
        pass


if __name__ == "__main__":
    unittest.main()
