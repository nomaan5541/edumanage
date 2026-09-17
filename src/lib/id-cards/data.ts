export interface IdCardPlaceholderData {
  school: {
    name: string
    address: string
    logoUrl: string
    principalName: string
  }
  student: {
    fullName: string
    admissionNo: string
    rollNo: string
    className: string
    sectionName: string
    dateOfBirth: string
    bloodGroup: string
    photoUrl: string
  }
  staff: {
    fullName: string
    employeeId: string
    designation: string
    department: string
    photoUrl: string
  }
  visitor: {
    fullName: string
    purpose: string
    validOn: string
  }
  guardian: {
    phone: string
  }
  card: {
    qrPayload: string
  }
}

export const SAMPLE_ID_CARD_DATA: IdCardPlaceholderData = {
  school: {
    name: 'Sunrise Public School',
    address: '12 Lake View Road, Hyderabad 500033',
    logoUrl: '',
    principalName: 'Dr. A. Rao',
  },
  student: {
    fullName: 'Ananya Reddy',
    admissionNo: 'ADM-2026-0142',
    rollNo: '18',
    className: 'Class 8',
    sectionName: 'B',
    dateOfBirth: '21 Apr 2013',
    bloodGroup: 'O+',
    photoUrl: '',
  },
  staff: {
    fullName: 'Ravi Kumar',
    employeeId: 'EMP-104',
    designation: 'Mathematics Teacher',
    department: 'Secondary',
    photoUrl: '',
  },
  visitor: {
    fullName: 'Priya Sharma',
    purpose: 'Parent meeting',
    validOn: '15 Sep 2026',
  },
  guardian: {
    phone: '+91 98765 43210',
  },
  card: {
    qrPayload: 'edumanage:student:ADM-2026-0142',
  },
}
