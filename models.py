from google.appengine.ext import db
from datetime import datetime


__all__ = ['Account', 'Room', 'RoomList', 'Message_event_names', 'Message_event_codes', 'Message']


class Account(db.Model):
    user = db.UserProperty(required=True)
    nickname = db.StringProperty(required=True)
    url = db.StringProperty(default='')
    gravatar_tag = db.StringProperty(default='')    


class Room(db.Model):
    name = db.StringProperty(required=True)
    topic = db.StringProperty(default='')


class RoomList(db.Model):
    account = db.ReferenceProperty(reference_class=Account, required=True)
    room = db.ReferenceProperty(reference_class=Room, required=True)
    status = db.StringProperty(default='')
    last_seen = db.DateTimeProperty(auto_now_add=True, required=True)
    status = db.StringProperty( default = '' )
    status_start = db.DateTimeProperty()

    def update_presence(self):
        self.last_seen = datetime.now()
        self.put()


Message_event_names = {
    0: 'message',
    1: 'topic',
    2: 'join',
    3: 'part',
    4: 'action',
    5: 'status',
    }
Message_event_codes = dict([(v, k) for (k, v) in Message_event_names.items()])
class Message(db.Model):
    sender = db.ReferenceProperty(reference_class=Account, required=True)
    room = db.ReferenceProperty(reference_class=Room, required=True)
    timestamp = db.DateTimeProperty(auto_now_add=True, required=True)
    event = db.IntegerProperty(required=True, choices=Message_event_codes.values())
    content = db.StringProperty()
    extra = db.StringProperty()
