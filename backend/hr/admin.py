from django.contrib import admin

from .models import EmployeeCollateral, Leave, LeaveBalance, Ticket

admin.site.register(EmployeeCollateral)
admin.site.register(Leave)
admin.site.register(LeaveBalance)
admin.site.register(Ticket)
