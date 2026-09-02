/** Name pools for a believable Indian school roster. Deterministic, no randomness at import. */

export const BOY_FIRST = [
  "Aarav","Vivaan","Aditya","Vihaan","Arjun","Reyansh","Krishna","Ishaan","Shaurya","Atharv",
  "Rudra","Kabir","Ansh","Yuvraj","Dhruv","Kartik","Rohan","Aryan","Devansh","Harsh",
  "Laksh","Naman","Om","Parth","Rishi","Samarth","Tanish","Utkarsh","Varun","Yash",
  "Abhinav","Chirag","Darsh","Ekansh","Gaurav","Hriday","Jayesh","Manav","Nakul","Pranav",
];

export const GIRL_FIRST = [
  "Aadhya","Ananya","Diya","Ira","Kiara","Myra","Navya","Pari","Riya","Saanvi",
  "Anika","Avni","Bhavya","Charvi","Disha","Eesha","Gauri","Hetal","Ishita","Janvi",
  "Kavya","Lavanya","Meera","Nidhi","Ojasvi","Prisha","Rachana","Sneha","Tanvi","Vanya",
  "Aarohi","Bhoomi","Chhavi","Dhriti","Esha","Falguni","Garima","Harshita","Inaya","Jhanvi",
];

export const SURNAMES = [
  "Sharma","Verma","Gupta","Patel","Singh","Yadav","Mishra","Tiwari","Joshi","Nair",
  "Menon","Iyer","Reddy","Rao","Naidu","Chauhan","Rathore","Solanki","Jain","Agarwal",
  "Bansal","Chopra","Kapoor","Malhotra","Sethi","Ahuja","Bhatia","Dubey","Pandey","Trivedi",
  "Saxena","Shukla","Srivastava","Thakur","Rajput","Kushwaha","Lodhi","Ahirwar","Malviya","Choubey",
];

export const FATHER_FIRST = [
  "Rajesh","Suresh","Mahesh","Ramesh","Dinesh","Naresh","Umesh","Yogesh","Mukesh","Hitesh",
  "Anil","Sunil","Vinod","Pramod","Ashok","Alok","Deepak","Sanjay","Vijay","Ajay",
  "Manoj","Rakesh","Prakash","Satish","Girish","Nitin","Sachin","Amit","Sumit","Rohit",
];

export const MOTHER_FIRST = [
  "Sunita","Anita","Kavita","Savita","Rekha","Neha","Seema","Meena","Reena","Poonam",
  "Shobha","Pushpa","Lata","Geeta","Sita","Radha","Nisha","Manisha","Vandana","Archana",
  "Jyoti","Preeti","Priya","Swati","Shweta","Deepa","Renu","Usha","Asha","Sarita",
];

/**
 * The teaching staff.
 *
 * The length of this list is not decoration: 23 sections at eight periods a day is
 * 1,012 periods a week, and a teacher can take about 30 of them. Twenty-four
 * teachers could cover 720, so the timetable could only be filled by putting
 * somebody in two rooms at once — which is exactly what the old one did. Thirty-eight
 * teachers for 849 children is also the ratio a CBSE school of this size actually
 * runs at.
 *
 * The gender is written down beside the name because the seed used to derive it from
 * the position in this list — every other teacher, alternating — which recorded
 * Ravi Shankar Mishra as female and Anjali Deshpande as male. It showed: the demo's
 * first chat conversation addressed a male class teacher as "ma'am".
 */
export const TEACHER_NAMES: Array<[string, "FEMALE" | "MALE"]> = [
  ["Priya Menon", "FEMALE"], ["Anjali Deshpande", "FEMALE"], ["Rakesh Tiwari", "MALE"],
  ["Sunita Rathore", "FEMALE"], ["Vikram Chauhan", "MALE"], ["Meera Krishnan", "FEMALE"],
  ["Sanjay Dubey", "MALE"], ["Kavita Joshi", "FEMALE"], ["Arun Nair", "MALE"],
  ["Shalini Verma", "FEMALE"], ["Deepak Saxena", "MALE"], ["Neelam Pandey", "FEMALE"],
  ["Ravi Shankar Mishra", "MALE"], ["Pooja Bansal", "FEMALE"], ["Amit Trivedi", "MALE"],
  ["Rashmi Shukla", "FEMALE"], ["Gopal Yadav", "MALE"], ["Sneha Kulkarni", "FEMALE"],
  ["Manish Agarwal", "MALE"], ["Vandana Solanki", "FEMALE"], ["Harish Malviya", "MALE"],
  ["Ritu Choubey", "FEMALE"], ["Naveen Rao", "MALE"], ["Aparna Iyer", "FEMALE"],
  ["Swati Bhargava", "FEMALE"], ["Mukesh Ahirwar", "MALE"], ["Lata Sharma", "FEMALE"],
  ["Devendra Patel", "MALE"], ["Nisha Khare", "FEMALE"], ["Yogesh Baghel", "MALE"],
  ["Preeti Namdeo", "FEMALE"], ["Sudhir Jain", "MALE"], ["Anita Gour", "FEMALE"],
  ["Ramkumar Lodhi", "MALE"], ["Bhavna Sethi", "FEMALE"], ["Alok Dwivedi", "MALE"],
  ["Jyoti Raikwar", "FEMALE"], ["Satish Parmar", "MALE"],
];

export const SUBJECTS_PRIMARY = ["English","Hindi","Mathematics","Environmental Science","General Knowledge","Computer","Drawing"];
export const SUBJECTS_MIDDLE = ["English","Hindi","Mathematics","Science","Social Science","Sanskrit","Computer Science"];
export const SUBJECTS_SECONDARY = ["English","Hindi","Mathematics","Science","Social Science","Information Technology"];
export const CO_SCHOLASTIC = ["Work Education","Art Education","Health & Physical Education"];

export const CATEGORIES = ["GEN","GEN","GEN","OBC","OBC","SC","ST"];
export const BLOOD_GROUPS = ["A+","B+","O+","AB+","A-","B-","O-"];
export const RELIGIONS = ["Hindu","Hindu","Hindu","Muslim","Christian","Sikh","Jain"];
export const MOTHER_TONGUES = ["Hindi","Hindi","Hindi","Marathi","Bundeli","Urdu","Malayalam","Tamil"];

export const LOCALITIES = [
  "Arera Colony","Shahpura","Kolar Road","Bairagarh","Ayodhya Nagar","Karond","Govindpura",
  "Hoshangabad Road","Chunabhatti","Nehru Nagar","Saket Nagar","Bagmugalia",
];

export const BOOK_TITLES: Array<[string, string, string]> = [
  ["Panchatantra Tales","Vishnu Sharma","Story"],
  ["Malgudi Days","R. K. Narayan","Fiction"],
  ["Wings of Fire","A. P. J. Abdul Kalam","Biography"],
  ["The Jungle Book","Rudyard Kipling","Fiction"],
  ["Discovery of India","Jawaharlal Nehru","History"],
  ["Train to Pakistan","Khushwant Singh","Fiction"],
  ["Gitanjali","Rabindranath Tagore","Poetry"],
  ["A Brief History of Time","Stephen Hawking","Science"],
  ["Indian Constitution for Children","P. M. Bakshi","Civics"],
  ["Complete Adventures of Feluda","Satyajit Ray","Fiction"],
  ["Champak Collection","Delhi Press","Magazine"],
  ["NCERT Atlas of India","NCERT","Reference"],
  ["Amar Chitra Katha: Mahabharata","Anant Pai","Story"],
  ["The Room on the Roof","Ruskin Bond","Fiction"],
  ["Science Encyclopedia for Young Readers","DK","Reference"],
  ["Mathematics Olympiad Workbook","Arihant","Reference"],
  ["Premchand ki Kahaniyan","Munshi Premchand","Hindi Literature"],
  ["Rashmirathi","Ramdhari Singh Dinkar","Poetry"],
  ["My Experiments with Truth","M. K. Gandhi","Biography"],
  ["Bhopal: A City of Lakes","Local Press","Regional"],
];
