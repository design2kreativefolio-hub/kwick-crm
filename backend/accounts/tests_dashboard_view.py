from django.test import TestCase
from rest_framework.test import APIClient

from .models import ModuleAccess, User


class DashboardViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin@x.test", "pw", full_name="Admin")
        self.emp = User.objects.create_user("emp@x.test", "pw", full_name="Emp", status="active")
        self.grant = ModuleAccess.objects.create(user=self.emp, module="bd", granted_by=self.admin)

    def _me(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c.get("/api/auth/me").json()

    def test_default_is_normal_dashboard(self):
        self.assertFalse(self._me(self.emp)["bd_dashboard"])

    def test_admin_can_switch_to_sales_dashboard(self):
        c = APIClient()
        c.force_authenticate(self.admin)
        r = c.patch(f"/api/auth/module-access/{self.grant.id}", {"sales_dashboard": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(self._me(self.emp)["bd_dashboard"])
        # the BD grant itself is unchanged
        self.assertEqual(self._me(self.emp)["module_access"], ["bd"])

    def test_switch_cannot_move_the_grant(self):
        other = User.objects.create_user("o@x.test", "pw", status="active")
        c = APIClient()
        c.force_authenticate(self.admin)
        c.patch(f"/api/auth/module-access/{self.grant.id}", {"user": other.id, "module": "hr"}, format="json")
        self.grant.refresh_from_db()
        self.assertEqual((self.grant.user_id, self.grant.module), (self.emp.id, "bd"))

    def test_employee_cannot_change_it(self):
        c = APIClient()
        c.force_authenticate(self.emp)
        r = c.patch(f"/api/auth/module-access/{self.grant.id}", {"sales_dashboard": True}, format="json")
        self.assertIn(r.status_code, (401, 403))
        self.assertFalse(self._me(self.emp)["bd_dashboard"])

    def test_superadmin_never_gets_it(self):
        self.assertFalse(self._me(self.admin)["bd_dashboard"])
