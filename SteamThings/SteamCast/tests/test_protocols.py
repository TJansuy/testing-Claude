"""Unit tests for the wire formats: CASTV2 protobuf, mDNS, SSDP, SCPD."""
import struct
import unittest
import xml.etree.ElementTree as ET

from steamcast.cast import proto
from steamcast.dlna_scpd import SERVICES, scpd_xml
from steamcast.mdns import PTR, SRV, Responder, Service, encode_name, parse_questions
from steamcast.ssdp import SsdpServer


class CastProtoTest(unittest.TestCase):
    def test_round_trip_string_and_binary(self):
        for payload in ('{"type":"PING"}', b"\x01\x02\xff"):
            msg = proto.CastMessage("sender-0", "receiver-0", proto.NS_HEARTBEAT, payload)
            framed = proto.frame(msg)
            (length,) = struct.unpack(">I", framed[:4])
            self.assertEqual(length, len(framed) - 4)
            self.assertEqual(proto.decode(framed[4:]), msg)

    def test_long_varint(self):
        payload = "x" * 70000
        msg = proto.CastMessage("a", "b", "ns", payload)
        self.assertEqual(proto.decode(proto.encode(msg)).payload, payload)

    def test_device_auth_error_shape(self):
        fields = proto.parse_fields(proto.device_auth_error())
        self.assertEqual(proto.parse_fields(fields[3]), {1: 0})


def mdns_query(name_labels, qtype, unicast=False):
    header = struct.pack("!6H", 0, 0, 1, 0, 0, 0)
    qclass = 1 | (0x8000 if unicast else 0)
    return header + encode_name(name_labels) + struct.pack("!2H", qtype, qclass)


class MdnsTest(unittest.TestCase):
    def setUp(self):
        self.svc = Service("SteamCast-abc", "_googlecast._tcp", 8009, {"fn": "Living Room"})
        self.responder = Responder("deck-steamcast", "192.168.1.20", [self.svc])

    def test_parse_question(self):
        q = parse_questions(mdns_query(("_googlecast", "_tcp", "local"), PTR, unicast=True))
        self.assertEqual(q, [(("_googlecast", "_tcp", "local"), PTR, True)])

    def test_ptr_query_answers_with_srv_txt_a(self):
        q = parse_questions(mdns_query(("_GoogleCast", "_tcp", "local"), PTR))
        answers, extra = self.responder.answer(q)
        self.assertEqual(len(answers), 1)
        self.assertEqual(len(extra), 3)
        self.assertIn(b"Living Room", b"".join(extra))
        self.assertIn(bytes([192, 168, 1, 20]), extra[-1])

    def test_srv_query_and_unrelated_query(self):
        q = parse_questions(mdns_query(self.svc.name_labels, SRV))
        answers, _ = self.responder.answer(q)
        self.assertTrue(answers)
        q = parse_questions(mdns_query(("_airplay", "_tcp", "local"), PTR))
        self.assertEqual(self.responder.answer(q), ([], []))

    def test_responses_are_ignored(self):
        packet = bytearray(mdns_query(("_googlecast", "_tcp", "local"), PTR))
        packet[2] = 0x84
        self.assertEqual(parse_questions(bytes(packet)), [])


class SsdpTest(unittest.TestCase):
    def test_search_responses(self):
        ssdp = SsdpServer("10.0.0.2", "http://10.0.0.2:8090/d.xml", "uuid:x",
                          "urn:schemas-upnp-org:device:MediaRenderer:1", [])
        self.assertEqual(len(ssdp.search_response("ssdp:all")), 3)
        [resp] = ssdp.search_response("urn:schemas-upnp-org:device:MediaRenderer:1")
        self.assertIn(b"USN: uuid:x::urn:schemas-upnp-org:device:MediaRenderer:1", resp)
        self.assertEqual(ssdp.search_response("urn:other"), [])


class ScpdTest(unittest.TestCase):
    def test_every_service_is_valid_xml_with_all_variables(self):
        ns = "{urn:schemas-upnp-org:service-1-0}"
        for name in SERVICES:
            root = ET.fromstring(scpd_xml(name))
            declared = {v.findtext(f"{ns}name") for v in root.iter(f"{ns}stateVariable")}
            related = {a.findtext(f"{ns}relatedStateVariable") for a in root.iter(f"{ns}argument")}
            self.assertTrue(related <= declared, name)


if __name__ == "__main__":
    unittest.main()
