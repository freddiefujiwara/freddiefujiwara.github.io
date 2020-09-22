/* Change this file to get your personal Portfolio */

// Your Summary And Greeting Section

import emoji from "react-easy-emoji";

const greeting = {
  /* Your Summary And Greeting Section */
  username: "Freddie Fujiwara",
  title: "Hi all, I'm Freddie",
  subTitle: emoji("A professional software testing manager and A hobby Software Developer 🚀 having certificates ISTQB CTAL-TA and TM and an experience of building Web and Mobile applications with JavaScript /Ruby / PHP / Nodejs and some other cool libraries and frameworks."),
  resumeLink: "https://www.linkedin.com/in/freddiefujiwara/"
};

// Your Social Media Link

const socialMediaLinks = {

  github: "https://github.com/freddiefujiwara",
  linkedin: "https://www.linkedin.com/in/freddiefujiwara/",
  facebook: "https://www.facebook.com/freddiefujiwara",
  stackoverflow: "https://stackoverflow.com/users/76509/freddiefujiwara"
  // Instagram and Twitter are also supported in the links!
};

// Your Skills Section

const skillsSection = {
  title: "What i do",
  subTitle: "Passionate test manager and crazy NO CODE lover and hobby developer.",
  skills: [
    emoji("⚡ Test management for large scaled products"),
    emoji("⚡ Develop cool stuff w/ GAS and glideapps"),
    emoji("⚡ Develop cool CLI w/ nodejs")
  ],

  /* Make Sure You include correct Font Awesome Classname to view your icon
https://fontawesome.com/icons?d=gallery */

  softwareSkills: [
    {
      skillName: "software testing",
      fontAwesomeClassname: "ISTQB CTAL-TM,CTAL-TA"
    },
    {
      skillName: "JavaScript",
      fontAwesomeClassname: "fab fa-js"
    },
    {
      skillName: "nodejs",
      fontAwesomeClassname: "fab fa-node"
    },
    {
      skillName: "npm",
      fontAwesomeClassname: "fab fa-npm"
    },
    {
      skillName: "mysql",
      fontAwesomeClassname: "fas fa-database"
    },
    {
      skillName: "google app script",
      fontAwesomeClassname: "fab fa-aws"
    },
  ]
};

// Your top 3 proficient stacks/tech experience

const techStack = {
  viewSkillBars: true, //Set it to true to show Proficiency Section
  experience: [
    {
      Stack: "Backend",
      progressPercentage: "70%"
    },
    {
      Stack: "Programming",
      progressPercentage: "60%"
    }
  ]
};


// Your top 3 work experiences

const workExperiences = {
  viewExperiences: true, //Set it to true to show workExperiences Section
  experience: [
    {
      role: "Test Manager ",  
      company: "Rakuten",
      companylogo: require("./assets/images/rakuten.png"),
      date: "Aug 2010 – Present",
      desc: "",
      descBullets: [
        "",
        ""
      ]
    },
    {
      role: "Assistant manager of development",   
      company: "Kakaku.com",
      companylogo: require("./assets/images/kakaku.jpg"),
      date: "Nov 2007 – Jul 2010",
      desc: ""
    },
    {
      role: "Software Engineer",  
      company: "Yahoo! Japan",
      companylogo: require("./assets/images/yj.png"),
      date: "Apr 2004 – Oct 2007",
      desc: ""
    },
  ]
};

/* Your Open Source Section to View Your Github Pinned Projects
To know how to get github key look at readme.md */

const openSource = {
  githubConvertedToken: process.env.REACT_APP_GITHUB_TOKEN,
  githubUserName: "freddiefujiwara", // Change to your github username to view your profile in Contact Section.
  showGithubProfile :"true" // Set true or false to show Contact profile using Github, defaults to false 
};


// Some Big Projects You have worked with your company

const  bigProjects = {
  title: "My Personal Projects",
  subtitle: "SOME STARTUPS AND COMPANIES THAT I HELPED TO CREATE THEIR TECH",
  projects: [
    {
      image: require("./assets/images/around80.png"),
      link: "https://leanpub.com/AroundTheWorldWith80SoftwareTesters"
    },
    {
      image: require("./assets/images/ahcd.png"),
      link: "https://freddiefujiwara.com/ahcd/"
    },
    {
      image: require("./assets/images/prisma.jpg"),
      link: "https://github.com/freddiefujiwara/prisma"
    },
    {
      image: require("./assets/images/hello.png"),
      link: "https://freddiefujiwara.com/hellocycling-history/"
    },
    {
      image: require("./assets/images/qict.png"),
      link: "https://freddiefujiwara.com/node-qict"
    },
    {
      image: require("./assets/images/dtdt.png"),
      link: "https://freddiefujiwara.com/dtdt"
    },
    {
      image: require("./assets/images/smtc.png"),
      link: "http://freddiefujiwara.com/smtc"
    }
  ]
};

// Your Achievement Section Include Your Certification Talks and More

const achievementSection = {

  title: emoji("Achievements And Certifications 🏆 "),
  subtitle: "Achievements, Certifications, Award Letters and Some Cool Stuff that I have done !",

  achivementsCards: [
    {
      title: "ISTQB Advanced Level Test Manager",
      subtitle: "JSTQB-AL-00000448",
      image: require("./assets/images/istqb.png"),
      footerLink: [
        { name: "Certification", url: "https://photos.app.goo.gl/WYJCU5LuHUFpqCD38" }
      ]
    },
    {
      title: "ISTQB Advanced Level Test Analyst",
      subtitle: "JSTQB-ALTA-00000085",
      image: require("./assets/images/istqb.png"),
      footerLink: [
        { name: "Certification", url: "https://photos.app.goo.gl/cAPUaYZW4oYw86l53" }
      ]
    },
    {
      title: "ISTQB Foundation Level Tester",
      subtitle: "JSTQB-FL-0013320",
      image: require("./assets/images/istqb.png"),
      footerLink: [
        { name: "Certification", url: "https://photos.app.goo.gl/vcux6N2FObzI9Arv1" }
      ]
    }
  ]
};

// Blogs Section

const blogSection = {

  title: "Blogs",
  subtitle: "I want to have a tech blog",

  blogs: [ /*
    {
      url: "https://blog.usejournal.com/create-a-google-assistant-action-and-win-a-google-t-shirt-and-cloud-credits-4a8d86d76eae",
      title: "Win a Google Assistant Tshirt and $200 in Google Cloud Credits",
      description: "Do you want to win $200 and Google Assistant Tshirt by creating a Google Assistant Action in less then 30 min?"
    },
    {
      url: "https://medium.com/@freddiefujiwara/why-react-is-the-best-5a97563f423e",
      title: "Why REACT is The Best?",
      description: "React is a JavaScript library for building User Interface. It is maintained by Facebook and a community of individual developers and companies."
    }
    */ ]
};

// Talks Sections

const talkSection = {
  title: "TALKS",
  subtitle: emoji("I LOVE TO SHARE MY LIMITED KNOWLEDGE AND GET A SPEAKER BADGE 😅"),

  talks: [
    {
      title: "Struggles and challenges in STLC",
      subtitle: "楽天レジャー・サービスにおける短いアップデートサイクル中での品質活動",
      slides_url: "https://www.slideshare.net/rakutentech/ss-146847271",
      event_url: "https://techplay.jp/event/726076"
    }
  ]
};

// Podcast Section

const podcastSection = {
  title: emoji("Podcast 🎙️"),
  subtitle: "I want to have a podcast channel",

  // Please Provide with Your Podcast embeded Link
  podcast: [/*"https://anchor.fm/codevcast/embed/episodes/DevStory---Freddie-Pasta-from-Karachi--Pakistan-e9givv/a-a15itvo" */]
};

const contactInfo = {
  title: emoji("Contact Me ☎️"),
  subtitle: "Discuss a project or just want to say hi? My Inbox is open for all.",
  email_address: "github@ze.gs"
};

//Twitter Section

const twitterDetails = {

  userName : "freddiefujiwara"//Replace "twitter" with your twitter username without @

};
export { greeting, socialMediaLinks, skillsSection, techStack, workExperiences, openSource, bigProjects, achievementSection, blogSection, talkSection, podcastSection, contactInfo , twitterDetails};
